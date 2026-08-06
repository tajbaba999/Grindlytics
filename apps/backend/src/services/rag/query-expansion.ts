import { env as appEnv } from "../../env.js";
import { getGenAI } from "./genai.js";

export type ExpandedQuery = {
  queries: string[];
  hyde: string | null;
};

function noExpansion(question: string): ExpandedQuery {
  return { queries: [question], hyde: null };
}

function parseJson(text: string): { variants?: string[]; hyde?: string } | null {
  try {
    return JSON.parse(text) as { variants?: string[]; hyde?: string };
  }
  catch {
    return null;
  }
}

// Expands a user question into multiple retrieval queries (paraphrases +
// sub-questions) plus an optional HyDE (hypothetical document) used for dense
// retrieval. Best-effort: any failure falls back to the single original query.
export async function expandQuery(question: string, username: string): Promise<ExpandedQuery> {
  if (!appEnv.QUERY_EXPANSION_ENABLED)
    return noExpansion(question);

  const variantCount = Math.max(1, appEnv.QUERY_EXPANSION_VARIANTS);

  try {
    const model = getGenAI().getGenerativeModel({ model: appEnv.GEMINI_MODEL });
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                `You are expanding a question for retrieval from ${username}'s LeetCode profile RAG.`,
                "Generate exactly ",
                String(variantCount),
                " alternative search queries that would each independently retrieve the most relevant profile data for the user's question. Cover different phrasings, synonyms, and angles.",
                appEnv.HYDE_ENABLED
                  ? "Also write one hypothetical answer (a short plausible paragraph the profile data might say) as a HyDE document for dense retrieval."
                  : "",
                "Respond ONLY with JSON: {\"variants\": [\"query1\", \"query2\", ...]".concat(appEnv.HYDE_ENABLED ? ", \"hyde\": \"hypothetical answer paragraph\"" : "").concat("}"),
                "",
                `User question: ${question}`,
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    const parsed = parseJson(result.response.text() ?? "");
    if (!parsed)
      return noExpansion(question);

    const variants = (parsed.variants ?? [])
      .map(v => v.trim())
      .filter(v => v.length > 0 && v !== question)
      .slice(0, variantCount);

    const hyde = appEnv.HYDE_ENABLED && parsed.hyde?.trim() ? parsed.hyde.trim() : null;

    if (variants.length === 0 && !hyde)
      return noExpansion(question);

    return { queries: [question, ...variants], hyde };
  }
  catch {
    return noExpansion(question);
  }
}
