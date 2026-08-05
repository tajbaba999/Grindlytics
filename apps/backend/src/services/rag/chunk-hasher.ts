import { createHash } from "node:crypto";

import type { Chunk } from "./document-builder.js";

import prisma from "@leetplus/db";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function getChangedChunks(userId: string, chunks: Chunk[]): Promise<Chunk[]> {
  const existingHashes = await prisma.ragChunkHash.findMany({ where: { userId } });
  const hashMap = new Map(existingHashes.map(r => [r.chunkId, r.hash]));

  return chunks.filter((chunk) => {
    const newHash = sha256(chunk.text);
    return hashMap.get(chunk.id) !== newHash;
  });
}

export async function saveChunkHashes(userId: string, chunks: Chunk[]): Promise<void> {
  if (chunks.length === 0) return;
  const now = new Date();
  await prisma.$transaction(
    chunks.map((chunk) => {
      const hash = sha256(chunk.text);
      return prisma.ragChunkHash.upsert({
        where: { userId_chunkId: { userId, chunkId: chunk.id } },
        create: { userId, chunkId: chunk.id, hash, updatedAt: now },
        update: { hash, updatedAt: now },
      });
    }),
  );
}
