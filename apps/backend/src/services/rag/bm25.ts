import MiniSearch from "minisearch";

import { getAllChunks, type ChunkQueryFilter, type StoredChunk } from "./chroma.js";

export type Bm25Result = StoredChunk & { score: number };

type UserIndex = {
  index: MiniSearch;
  chunks: Map<string, StoredChunk>;
};

const _indexes = new Map<string, UserIndex>();

function buildUserIndex(chunks: StoredChunk[]): UserIndex {
  const index = new MiniSearch({
    fields: ["text", "label"],
    storeFields: ["label"],
    searchOptions: {
      boost: { text: 1, label: 2 },
      prefix: true,
      fuzzy: 0.2,
    },
  });
  index.addAll(chunks.map(c => ({ id: c.id, text: c.text, label: c.label })));
  return { index, chunks: new Map(chunks.map(c => [c.id, c])) };
}

export async function getOrBuildIndex(userId: string): Promise<UserIndex> {
  const cached = _indexes.get(userId);
  if (cached)
    return cached;

  const chunks = await getAllChunks(userId);
  const built = buildUserIndex(chunks);
  _indexes.set(userId, built);
  return built;
}

export function refreshIndex(userId: string, chunks: StoredChunk[]): void {
  _indexes.set(userId, buildUserIndex(chunks));
}

export function clearIndex(userId: string): void {
  _indexes.delete(userId);
}

function matchesFilter(chunk: StoredChunk, filter?: ChunkQueryFilter): boolean {
  if (!filter)
    return true;
  if (filter.type && (filter.type === "problem" ? !chunk.id.startsWith("problem-") : chunk.id.startsWith("problem-")))
    return false;
  if (filter.tag && !chunk.text.toLowerCase().includes(filter.tag.toLowerCase()))
    return false;
  return true;
}

export function searchBm25(
  user: UserIndex,
  query: string,
  topK: number = 8,
  filter?: ChunkQueryFilter,
): Bm25Result[] {
  const raw = user.index.search(query) as Array<{ id: string; label?: string; score: number }>;

  return raw
    .map((r) => {
      const chunk = user.chunks.get(r.id);
      return chunk ? { ...chunk, score: r.score } : null;
    })
    .filter((r): r is Bm25Result => r !== null)
    .filter(r => matchesFilter(r, filter))
    .slice(0, topK);
}

export function invalidateIndex(userId: string): void {
  clearIndex(userId);
}
