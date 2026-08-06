import type { ChunkQueryFilter } from "./chroma.js";
import type { ConfidenceResult } from "./confidence.js";

import { env } from "../../env.js";
import { confidenceFromLogit } from "./confidence.js";
import { getGenAI } from "./genai.js";
import { buildGroundingContext, verifyAgainstSources } from "./grounding.js";
import { multiQuerySearch } from "./hybrid-search.js";
import type { GroundingResult } from "./grounding.js";
import { expandQuery } from "./query-expansion.js";

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

export type SourceRef = {
  chunkId: string;
  label: string;
};

export type ChatResult = {
  answer: string;
  sources: SourceRef[];
  grounding: GroundingResult;
  confidence: ConfidenceResult;
};

export type ChatChunk = {
  type: "sources" | "token" | "done";
  content: string;
  sources?: SourceRef[];
  confidence?: ConfidenceResult;
};

async function buildContext(
  userId: string,
  username: string,
  question: string,
  filter?: ChunkQueryFilter,
): Promise<{ context: string; sources: SourceRef[]; confidence: ConfidenceResult }> {
  const { queries, hyde } = await expandQuery(question, username);
  const { results, topLogit } = await retry(() => multiQuerySearch(userId, queries, 10, filter, hyde));
  const context = buildGroundingContext(results);
  const sources = results.map(m => ({ chunkId: m.id, label: m.label }));
  return { context, sources, confidence: confidenceFromLogit(topLogit) };
}

function buildConfidenceNote(level: ConfidenceResult["level"]): string {
  switch (level) {
    case "high":
      return "";
    case "medium":
      return "- Note: the retrieved data is only moderately relevant. Avoid overstating precision — flag anything you are unsure about.";
    case "low":
      return "- WARNING: the retrieved data is low-confidence. Be cautious, clearly state when the data is insufficient, and do not invent numbers.";
    case "unavailable":
      return "- Note: retrieval confidence could not be computed. If you are unsure, say so explicitly.";
  }
}

function buildSystemPrompt(username: string, context: string, confidence?: ConfidenceResult): string {
  const note = confidence ? buildConfidenceNote(confidence.level) : "";
  const prompt = [
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
  ];
  if (note) prompt.push(note);
  prompt.push("", "Profile data:", context);
  return prompt.join("\n");
}

export async function chat(
  userId: string,
  username: string,
  question: string,
  filter?: ChunkQueryFilter,
): Promise<ChatResult> {
  const { context, sources, confidence } = await buildContext(userId, username, question, filter);

  const result = await retry(async () => {
    const model = getGenAI().getGenerativeModel({ model: env.GEMINI_MODEL });
    return model.generateContent({
      contents: [
        { role: "user", parts: [{ text: `${buildSystemPrompt(username, context, confidence)}\n\nUser question: ${question}` }] },
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
    confidence,
  };
}

export async function* chatStream(
  userId: string,
  username: string,
  question: string,
  filter?: ChunkQueryFilter,
): AsyncGenerator<ChatChunk> {
  const { context, sources, confidence } = await buildContext(userId, username, question, filter);

  yield { type: "sources", content: "", sources, confidence };

  const stream = await retry(async () => {
    const model = getGenAI().getGenerativeModel({ model: env.GEMINI_MODEL });
    return model.generateContentStream({
      contents: [
        { role: "user", parts: [{ text: `${buildSystemPrompt(username, context, confidence)}\n\nUser question: ${question}` }] },
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
