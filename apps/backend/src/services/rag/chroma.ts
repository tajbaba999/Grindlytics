import { ChromaClient, type Collection } from "chromadb";

import type { ChunkWithVector } from "./embeddings.js";

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
    await col.upsert({
      ids: batch.map(c => `${userId}::${c.id}`),
      embeddings: batch.map(c => c.vector),
      metadatas: batch.map(c => ({ userId, type: c.type, chunkId: c.id, label: c.label })),
      documents: batch.map(c => c.text),
    });
  }
}

export async function queryChunks(
  userId: string,
  vector: number[],
  topK: number = 4,
): Promise<Array<{ id: string; text: string; label: string }>> {
  const col = await getCollection();

  const result = await col.query({
    queryEmbeddings: [vector],
    nResults: topK,
    where: { userId },
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
