import { ChromaClient, type Collection } from "chromadb";

import type { ChunkWithVector } from "./embeddings.js";

export type ChunkQueryFilter = {
  type?: "summary" | "problem";
  difficulty?: string;
  tag?: string;
};

let _client: ChromaClient | null = null;
let _collection: Collection | null = null;

/* eslint-disable node/no-process-env */
function getClient(): ChromaClient {
  if (_client)
    return _client;

  const apiKey = process.env.CHROMA_API_KEY;
  const tenant = process.env.CHROMA_TENANT;
  const database = process.env.CHROMA_DATABASE;

  if (apiKey && tenant) {
    _client = new ChromaClient({
      path: `https://${process.env.CHROMA_HOST ?? "api.trychroma.com"}`,
      auth: { provider: "token", credentials: apiKey, tokenHeaderType: "X_CHROMA_TOKEN" },
      tenant,
      database,
    });
  }
  else {
    _client = new ChromaClient({
      path: process.env.CHROMA_URL ?? "http://localhost:8000",
    });
  }

  return _client;
}
/* eslint-enable node/no-process-env */

const collectionName = () => process.env.CHROMA_COLLECTION ?? "rag-chunks";

async function getCollection(): Promise<Collection> {
  if (_collection)
    return _collection;
  _collection = await getClient().getOrCreateCollection({
    name: collectionName(),
    metadata: { "hnsw:space": "cosine" },
  });
  return _collection;
}

export async function upsertChunks(userId: string, chunks: ChunkWithVector[]): Promise<void> {
  if (chunks.length === 0)
    return;

  const col = await getCollection();

  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const metadatas = batch.map(c => ({
      userId,
      type: c.type,
      chunkId: c.id,
      label: c.label,
      ...(c.metadata.difficulty ? { difficulty: c.metadata.difficulty } : {}),
      ...(c.metadata.tags?.length ? { tags: c.metadata.tags } : {}),
      ...(c.metadata.lastSubmittedAt ? { lastSubmittedAt: c.metadata.lastSubmittedAt } : {}),
    }));
    await col.upsert({
      ids: batch.map(c => `${userId}::${c.id}`),
      embeddings: batch.map(c => c.vector),
      metadatas: metadatas as unknown as Array<Record<string, string | number | boolean>>,
      documents: batch.map(c => c.text),
    });
  }
}

function buildWhereClause(userId: string, filter?: ChunkQueryFilter): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [{ userId }];
  if (filter?.type)
    conditions.push({ type: filter.type });
  if (filter?.difficulty)
    conditions.push({ difficulty: filter.difficulty });
  if (filter?.tag)
    conditions.push({ tags: { $contains: filter.tag } });
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

export async function queryChunks(
  userId: string,
  vector: number[],
  topK: number = 4,
  filter?: ChunkQueryFilter,
): Promise<Array<{ id: string; text: string; label: string }>> {
  const col = await getCollection();

  const result = await col.query({
    queryEmbeddings: [vector],
    nResults: topK,
    where: buildWhereClause(userId, filter),
  });

  const ids: string[] = result.ids[0] ?? [];
  const docs: (string | null)[] = result.documents[0] ?? [];
  const metadatas = (result.metadatas?.[0] ?? []) as Array<{ label?: string } | null>;

  return ids.map((fullId, i) => ({
    id: fullId.split("::")[1] ?? fullId,
    text: docs[i] ?? "",
    label: metadatas[i]?.label ?? "Source",
  }));
}
