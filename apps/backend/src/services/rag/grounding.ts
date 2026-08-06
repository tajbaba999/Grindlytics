import type { SourceRef } from "./chat.js";

const SOURCE_TAG = /\[SOURCE:\s*([^\]]+)\]/g;

export type GroundingResult = {
  verified: number;
  invalid: number;
  total: number;
  cleanAnswer: string;
  fullyGrounded: boolean;
};

// Prefix each chunk with a [Source: <id>] marker so the LLM knows what it can
// cite. The prompt instructs the model to reference these IDs inline.
export function buildGroundingContext(chunks: Array<{ id: string; text: string }>): string {
  return chunks.map(c => `[Source: ${c.id}]\n${c.text}`).join("\n\n---\n\n");
}

function parseIds(match: string): string[] {
  return match
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export function verifyGrounding(answer: string, retrieved: Set<string>): GroundingResult {
  const tags = [...answer.matchAll(SOURCE_TAG)];

  const cited = new Set<string>();
  let verified = 0;
  let invalid = 0;
  for (const m of tags) {
    for (const id of parseIds(m[1])) {
      cited.add(id);
      if (retrieved.has(id))
        verified++;
      else
        invalid++;
    }
  }

  const cleanAnswer = answer.replace(SOURCE_TAG, (_full, ids) => {
    const valid = parseIds(ids).filter(id => retrieved.has(id));
    return valid.length > 0 ? `[SOURCE: ${valid.join(", ")}]` : "";
  });

  return {
    verified,
    invalid,
    total: cited.size,
    cleanAnswer,
    fullyGrounded: verified > 0 && invalid === 0,
  };
}

// Convenience helper for callers that have SourceRef[] (avoids Set construction)
export function verifyAgainstSources(answer: string, sources: SourceRef[]): GroundingResult {
  return verifyGrounding(answer, new Set(sources.map(s => s.chunkId)));
}
