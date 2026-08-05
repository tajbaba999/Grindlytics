import { GoogleGenerativeAI } from "@google/generative-ai";

import { queryChunks } from "./chroma.js";
import { embedChunks } from "./embeddings.js";

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

export type ChatResult = {
  answer: string;
  sources: string[];
};

export type ChatChunk = {
  type: "sources" | "token" | "done";
  content: string;
  sources?: string[];
};

async function buildContext(
  userId: string,
  username: string,
  question: string,
): Promise<{ context: string; sources: string[] }> {
  const [questionChunk] = await retry(() => embedChunks([{ id: "query", text: question, type: "summary" }]));
  const matches = await retry(() => queryChunks(userId, questionChunk.vector, 8));
  const context = matches.map(m => m.text).join("\n\n---\n\n");
  const sources = matches.map(m => m.id);
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
    "",
    "Profile data:",
    context,
  ].join("\n");
}

export async function chat(
  userId: string,
  username: string,
  question: string,
): Promise<ChatResult> {
  const { context, sources } = await buildContext(userId, username, question);

  const result = await retry(async () => {
    const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    return model.generateContent({
      contents: [
        { role: "user", parts: [{ text: `${buildSystemPrompt(username, context)}\n\nUser question: ${question}` }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    });
  });

  return {
    answer: result.response.text() ?? "No answer generated.",
    sources,
  };
}

export async function* chatStream(
  userId: string,
  username: string,
  question: string,
): AsyncGenerator<ChatChunk> {
  const { context, sources } = await buildContext(userId, username, question);

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
