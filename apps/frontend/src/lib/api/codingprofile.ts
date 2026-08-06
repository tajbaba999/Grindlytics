import type {
  ActivityResponse,
  ChatResponse,
  CodingProfileResponse,
  ConfidenceResult,
  HistoryResponse,
  LeetCodeProgressResponse,
  QuestionsResponse,
  SourceRef,
  SyncEvent,
  UserProfile,
} from "./types";

import { API_BASE, apiFetch } from "./client";
import { getAccessToken } from "./tokens";

export function getUserProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/profile");
}

export function getCodingProfile(): Promise<CodingProfileResponse> {
  return apiFetch<CodingProfileResponse>("/codingprofile/");
}

export function getQuestions(params: { difficulty?: string; tag?: string; limit?: number; offset?: number } = {}): Promise<QuestionsResponse> {
  const q = new URLSearchParams();
  if (params.difficulty && params.difficulty !== "all") q.set("difficulty", params.difficulty);
  if (params.tag) q.set("tag", params.tag);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<QuestionsResponse>(`/codingprofile/questions${qs ? `?${qs}` : ""}`);
}

export function getLeetCodeProgress(params: { skip?: number; limit?: number } = {}): Promise<LeetCodeProgressResponse> {
  const q = new URLSearchParams();
  if (params.skip) q.set("skip", String(params.skip));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch<LeetCodeProgressResponse>(`/leetcode/progress${qs ? `?${qs}` : ""}`);
}

export function getActivity(): Promise<ActivityResponse> {
  return apiFetch<ActivityResponse>("/codingprofile/activity");
}

export function getHistory(limit = 30): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(`/codingprofile/history?limit=${limit}`);
}

export function chat(question: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/rag/chat", { method: "POST", body: { question } });
}

export type ChatStreamChunk = {
  type: "sources" | "token" | "done" | "error";
  content: string;
  sources?: SourceRef[];
  confidence?: ConfidenceResult;
};

export async function chatStream(
  question: string,
  onChunk: (chunk: ChatStreamChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
  const res = await fetch(`${backendUrl}/api/v1/rag/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Chat failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.message || body?.error || message;
    } catch {
      /* stream body */
    }
    onChunk({ type: "error", content: message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const chunk = JSON.parse(line.slice(6)) as ChatStreamChunk;
            onChunk(chunk);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    }
  }
}

// Best-effort — indexes synced data for the RAG chat. Failure is non-fatal.
export function ingestRag(): Promise<unknown> {
  return apiFetch<unknown>("/rag/ingest", { method: "POST" });
}

// Topic × difficulty matrix (curated topics only).
export function getTopicMatrix(): Promise<import("./types").TopicMatrix> {
  return apiFetch<import("./types").TopicMatrix>("/codingprofile/topic-matrix");
}

// ── Streaming sync ──────────────────────────────────────────────
// initial-sync / sync stream Server-Sent Events directly from a POST, so we
// read the response body ourselves rather than using EventSource (which is
// GET-only and can't send an Authorization header).

export type SyncKind = "initial-sync" | "sync";

export async function streamSync(
  kind: SyncKind,
  leetcode: string | undefined,
  onEvent: (event: SyncEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/codingprofile/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(kind === "initial-sync" ? { leetcode } : {}),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Sync failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.message || body?.error || message;
    } catch {
      /* stream body — ignore */
    }
    onEvent({ type: "error", data: { stage: "error", pct: 0, msg: message } });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const parsed = parseFrame(frame);
      if (parsed) onEvent(parsed);
    }
  }
}

function parseFrame(frame: string): SyncEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // keepalive comment
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    const data = JSON.parse(dataLines.join("\n"));
    if (event === "completed") return { type: "completed", data };
    if (event === "error") return { type: "error", data };
    return { type: "progress", data };
  } catch {
    return null;
  }
}
