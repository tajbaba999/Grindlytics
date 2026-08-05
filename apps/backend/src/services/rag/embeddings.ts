import type { Chunk } from "./document-builder.js";

export type ChunkWithVector = Chunk & { vector: number[] };

// eslint-disable-next-line node/no-process-env
const GEMINI_KEY = () => process.env.GEMINI_API_KEY ?? "";

export async function embedChunks(chunks: Chunk[]): Promise<ChunkWithVector[]> {
  if (chunks.length === 0)
    return [];

  const results: ChunkWithVector[] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_KEY()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map(c => ({
            model: "models/gemini-embedding-001",
            content: { role: "user", parts: [{ text: c.text }] },
            outputDimensionality: 768,
          })),
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini embedding failed (${response.status}): ${err}`);
    }

    const data = await response.json() as { embeddings: Array<{ values: number[] }> };
    for (let j = 0; j < batch.length; j++) {
      results.push({
        ...batch[j],
        vector: data.embeddings[j].values,
      });
    }
  }

  return results;
}
