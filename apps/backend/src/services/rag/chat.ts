import { GoogleGenerativeAI } from "@google/generative-ai";

import type { ChunkQueryFilter } from "./chroma.js";

import { buildGroundingContext, verifyAgainstSources } from "./grounding.js";
import { hybridSearch } from "./hybrid-search.js";
import type { GroundingResult } from "./grounding.js";

async function retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  }
  catch (err) {
    if (retries <= 0) throw err;
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("ECONNRESET") || msg.includes("timeout") || msg.includes("socket hang up")) {
      await new Promise(r => setTimeout(r, 1000));
      return retry(fn, retries - 1);
    }
    throw err;
  }
}

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    // eslint-disable-next-line node/no-process-env
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  }
  return _genAI;
}

export type SourceRef = {
  chunkId: string;
  label: string;
};

export type ChatResult = {
  answer: string;
  sources: SourceRef[];
  grounding: GroundingResult;
};

export type ChatChunk = {
  type: "sources" | "token" | "done";
  content: string;
  sources?: SourceRef[];
};

async function buildContext(
  userId: string,
  username: string,
  question: string,
  filter?: ChunkQueryFilter,
): Promise<{ context: string; sources: SourceRef[] }> {
  const matches = await retry(() => hybridSearch(userId, question, 10, filter));
  const context = buildGroundingContext(matches);
  const sources = matches.map(m => ({ chunkId: m.id, label: m.label }));
  return { context, sources };
}

function buildSystemPrompt(username: string, context: string): string {
  return [
    `You are a LeetCode performance coach for ${username}.`,
    "Answer questions based ONLY on the profile data provided below.",
    "Rules:",
    "- Always reference specific numbers and exact counts from the data.",
    "- Give complete, structured answers. Use bullet points, tables, or numbered lists.",
    "- For 'each topic' or 'complete analysis' questions, list ALL topics with their counts — do not summarize or skip any.",
    "- Provide actionable recommendations at the end.",
    "- If the data is insufficient to answer, say so — never invent numbers.",
    "- Do NOT truncate your answer. Give the full analysis even if it is long.",
    "- CITATION REQUIREMENT: After every number or claim drawn from the data, append [SOURCE: chunk-id] using one of the source IDs marked in the data below. Every factual statement MUST be grounded in a source.",
    "",
    "Profile data:",
    context,
  ].join("\n");
}

export async function chat(
  userId: string,
  username: string,
  question: string,
  filter?: ChunkQueryFilter,
): Promise<ChatResult> {
  const { context, sources } = await buildContext(userId, username, question, filter);

  const result = await retry(async () => {
    const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    return model.generateContent({
      contents: [
        { role: "user", parts: [{ text: `${buildSystemPrompt(username, context)}\n\nUser question: ${question}` }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    });
  });

  const rawAnswer = result.response.text() ?? "No answer generated.";
  const grounding = verifyAgainstSources(rawAnswer, sources);

  return {
    answer: grounding.cleanAnswer,
    sources,
    grounding,
  };
}

export async function* chatStream(
  userId: string,
  username: string,
  question: string,
  filter?: ChunkQueryFilter,
): AsyncGenerator<ChatChunk> {
  const { context, sources } = await buildContext(userId, username, question, filter);

  yield { type: "sources", content: "", sources };

  const stream = await retry(async () => {
    const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    return model.generateContentStream({
      contents: [
        { role: "user", parts: [{ text: `${buildSystemPrompt(username, context)}\n\nUser question: ${question}` }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    });
  });

  for await (const chunk of stream.stream) {
    const token = chunk.text();
    if (token) {
      yield { type: "token", content: token };
    }
  }

  yield { type: "done", content: "" };
}
