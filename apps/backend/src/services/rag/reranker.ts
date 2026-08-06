import { AutoModelForSequenceClassification, AutoTokenizer } from "@huggingface/transformers";

import { env as appEnv } from "../../env.js";
import type { HybridResult } from "./hybrid-search.js";

type Reranker = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>>;
};

let _reranker: Reranker | null = null;
let _loadPromise: Promise<Reranker> | null = null;

async function getReranker(): Promise<Reranker> {
  if (_reranker)
    return _reranker;
  if (!_loadPromise) {
    _loadPromise = (async (): Promise<Reranker> => {
      const tokenizer = await AutoTokenizer.from_pretrained(appEnv.RERANK_MODEL);
      const model = await AutoModelForSequenceClassification.from_pretrained(appEnv.RERANK_MODEL);
      return { tokenizer, model };
    })();
  }
  return _loadPromise;
}

export type RerankOutput = {
  results: HybridResult[];
  topLogit: number | null;
};

export async function rerank(
  query: string,
  candidates: HybridResult[],
  topK: number,
): Promise<RerankOutput> {
  if (!appEnv.RERANK_ENABLED || candidates.length <= 1)
    return { results: candidates.slice(0, topK), topLogit: null };

  try {
    const { tokenizer, model } = await getReranker();

    const docs = candidates.map(c => c.text);
    const queries = candidates.map(() => query);

    const inputs = await tokenizer(docs, { text_pair: queries, padding: true, truncation: true });
    const { logits } = await model(inputs);

    const scores = Array.from(logits.data as unknown as number[]);

    const ranked = candidates
      .map((candidate, i) => ({ candidate, score: scores[i] ?? -Infinity }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return {
      results: ranked.map(x => x.candidate),
      topLogit: ranked[0]?.score ?? null,
    };
  }
  catch (err) {
    // Reranking is best-effort — fall back to hybrid order on failure
    return { results: candidates.slice(0, topK), topLogit: null };
  }
}
