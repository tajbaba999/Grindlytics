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

export type HybridSearchOutput = {
  results: HybridResult[];
  topLogit: number | null;
};

export async function hybridSearch(
  userId: string,
  question: string,
  topK: number = 10,
  filter?: ChunkQueryFilter,
): Promise<HybridSearchOutput> {
  const denseK = Math.max(topK * 2, 8);
  const sparseK = Math.max(topK * 2, 8);

  const [questionChunk] = await embedChunks([{ id: "query", text: question, type: "summary", label: "Query", metadata: {} }]);

  const [denseMatches, index] = await Promise.all([
    queryChunks(userId, questionChunk.vector, denseK, filter),
    getOrBuildIndex(userId),
  ]);
  const sparseMatches = searchBm25(index, question, sparseK, filter);

  const fused = reciprocalRankFusion(denseMatches, sparseMatches);

  const candidates = [...fused.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, Math.max(topK * 2, 8));

  return rerank(question, candidates, topK);
}
