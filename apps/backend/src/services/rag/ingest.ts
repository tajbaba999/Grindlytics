import type { RawProblem } from "../../queues/process.queue.js";
import type { LeetCodeSyncResult } from "../../types/coding-profiles.js";

import { getChangedChunks, saveChunkHashes } from "./chunk-hasher.js";
import { buildChunks } from "./document-builder.js";
import { embedChunks } from "./embeddings.js";
import { upsertChunks } from "./chroma.js";

export type IngestProgressCallback = (stage: string, pct: number, msg: string) => void | Promise<void>;

export async function ingestRag(
  userId: string,
  username: string,
  syncResult: LeetCodeSyncResult,
  problems: RawProblem[],
  onProgress?: IngestProgressCallback,
): Promise<{ upserted: number; skipped: number }> {
  // Step 1: Build all chunks from sync data
  await onProgress?.("rag_building", 63, "Building RAG documents from profile data...");
  const allChunks = buildChunks(username, syncResult, problems);

  // Step 2: Compare hashes to find changed chunks
  await onProgress?.("rag_diffing", 64, `Comparing ${allChunks.length} chunks against cache...`);
  const changedChunks = await getChangedChunks(userId, allChunks);

  if (changedChunks.length === 0) {
    await onProgress?.("rag_done", 100, `No changes detected — ${allChunks.length} chunks up to date`);
    return { upserted: 0, skipped: allChunks.length };
  }

  await onProgress?.("rag_diff_done", 65, `${changedChunks.length} of ${allChunks.length} chunks changed`);

  // Step 3: Embed changed chunks via Gemini
  await onProgress?.("embedding_started", 66, `Embedding ${changedChunks.length} chunks with Gemini...`);
  let withVectors;
  try {
    withVectors = await embedChunks(changedChunks);
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini embedding failed: ${msg}`);
  }
  await onProgress?.("embedding_done", 80, `Embedded ${withVectors.length} chunks`);

  // Step 4: Upsert vectors to ChromaDB
  await onProgress?.("chroma_started", 81, `Upserting ${withVectors.length} vectors to ChromaDB (user: ${userId.slice(0, 8)}...)...`);
  try {
    await upsertChunks(userId, withVectors);
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`ChromaDB upsert failed: ${msg}`);
  }
  await onProgress?.("chroma_done", 95, `Upserted ${withVectors.length} vectors to ChromaDB`);

  // Step 5: Save chunk hashes for next diff
  await onProgress?.("hash_saving", 96, "Saving chunk hashes for future diffs...");
  await saveChunkHashes(userId, changedChunks);
  await onProgress?.("rag_done", 100, `RAG ingest complete: ${changedChunks.length} chunks indexed`);

  return { upserted: changedChunks.length, skipped: allChunks.length - changedChunks.length };
}
