import { env as appEnv } from "../../env.js";

export type ConfidenceLevel = "high" | "medium" | "low" | "unavailable";

export type ConfidenceResult = {
  score: number | null;
  level: ConfidenceLevel;
  lowThreshold: number;
  highThreshold: number;
};

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Normalize the top-1 cross-encoder logit into a 0..1 relevance probability and
// bucket it against CONFIDENCE_LOW / CONFIDENCE_HIGH thresholds. A null logit
// (reranking disabled or failed) yields an "unavailable" level.
export function confidenceFromLogit(logit: number | null): ConfidenceResult {
  const lowThreshold = appEnv.CONFIDENCE_LOW;
  const highThreshold = appEnv.CONFIDENCE_HIGH;

  if (logit === null)
    return { score: null, level: "unavailable", lowThreshold, highThreshold };

  const score = sigmoid(logit);
  let level: ConfidenceLevel;
  if (score >= highThreshold)
    level = "high";
  else if (score <= lowThreshold)
    level = "low";
  else
    level = "medium";

  return { score, level, lowThreshold, highThreshold };
}
