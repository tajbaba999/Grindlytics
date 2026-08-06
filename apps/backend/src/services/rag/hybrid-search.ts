import type { ChunkQueryFilter } from "./chroma.js";

import { queryChunks } from "./chroma.js";
import { embedChunks } from "./embeddings.js";
import { getOrBuildIndex, searchBm25 } from "./bm25.js";
import { rerank } from "./reranker.js";

export type HybridResult = {
  id: string;
  text: string;
  label: string;
  rrfScore: number;
  denseRank: number | null;
  sparseRank: number | null;
};

const RRF_K = 60;

export function reciprocalRankFusion(
  dense: Array<{ id: string; text: string; label: string }>,
  sparse: Array<{ id: string; text: string; label: string }>,
): Map<string, HybridResult> {
  const fused = new Map<string, HybridResult>();

  dense.forEach((doc, i) => {
    const rank = i + 1;
    const existing = fused.get(doc.id);
    if (existing) {
      existing.rrfScore += 1 / (RRF_K + rank);
      existing.denseRank = rank;
    }
    else {
      fused.set(doc.id, {
        id: doc.id,
        text: doc.text,
        label: doc.label,
        rrfScore: 1 / (RRF_K + rank),
        denseRank: rank,
        sparseRank: null,
      });
    }
  });

  sparse.forEach((doc, i) => {
    const rank = i + 1;
    const existing = fused.get(doc.id);
    if (existing) {
      existing.rrfScore += 1 / (RRF_K + rank);
      existing.sparseRank = rank;
    }
    else {
      fused.set(doc.id, {
        id: doc.id,
        text: doc.text,
        label: doc.label,
        rrfScore: 1 / (RRF_K + rank),
        denseRank: null,
        sparseRank: rank,
      });
    }
  });

  return fused;
}

// Fuses multiple ranked result lists (from query variants + HyDE) into a single
// ranked list using reciprocal rank fusion.
function fuseRankedLists(lists: Array<Array<{ id: string; text: string; label: string }>>): Map<string, HybridResult> {
  const fused = new Map<string, HybridResult>();

  lists.forEach((docs) => {
    docs.forEach((doc, i) => {
      const rank = i + 1;
      const existing = fused.get(doc.id);
      if (existing) {
        existing.rrfScore += 1 / (RRF_K + rank);
      }
      else {
        fused.set(doc.id, {
          id: doc.id,
          text: doc.text,
          label: doc.label,
          rrfScore: 1 / (RRF_K + rank),
          denseRank: null,
          sparseRank: null,
        });
      }
    });
  });

  return fused;
}

type RetrievalResult = Array<{ id: string; text: string; label: string }>;

async function retrieveForQuery(
  userId: string,
  question: string,
  denseK: number,
  sparseK: number,
  filter?: ChunkQueryFilter,
): Promise<RetrievalResult> {
  const [questionChunk] = await embedChunks([{ id: "query", text: question, type: "summary", label: "Query", metadata: {} }]);

  const [denseMatches, index] = await Promise.all([
    queryChunks(userId, questionChunk.vector, denseK, filter),
    getOrBuildIndex(userId),
  ]);
  const sparseMatches = searchBm25(index, question, sparseK, filter);

  const fused = reciprocalRankFusion(denseMatches, sparseMatches);
  return [...fused.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}

export type HybridSearchOutput = {
  results: HybridResult[];
  topLogit: number | null;
};

// Retrieves against multiple query variants (multi-query expansion) plus an
// optional HyDE hypothetical document, fuses everything with RRF, and reranks
// the merged candidates against the original question.
export async function multiQuerySearch(
  userId: string,
  queries: string[],
  topK: number = 10,
  filter?: ChunkQueryFilter,
  hyde?: string | null,
): Promise<HybridSearchOutput> {
  const denseK = Math.max(topK * 2, 8);
  const sparseK = Math.max(topK * 2, 8);

  const lists = await Promise.all(queries.map(q => retrieveForQuery(userId, q, denseK, sparseK, filter)));

  if (hyde) {
    const [hydeChunk] = await embedChunks([{ id: "hyde", text: hyde, type: "summary", label: "Query", metadata: {} }]);
    lists.push(await queryChunks(userId, hydeChunk.vector, denseK, filter));
  }

  const fused = fuseRankedLists(lists);
  const candidates = [...fused.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, Math.max(topK * 2, 8));

  // Rerank against the user's actual question, not the expansion variants.
  return rerank(queries[0], candidates, topK);
}

// Single-query hybrid search (dense + BM25, RRF, rerank) — kept for callers
// that don't need query expansion.
export async function hybridSearch(
  userId: string,
  question: string,
  topK: number = 10,
  filter?: ChunkQueryFilter,
): Promise<HybridSearchOutput> {
  return multiQuerySearch(userId, [question], topK, filter, null);
}
