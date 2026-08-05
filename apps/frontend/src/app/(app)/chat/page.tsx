"use client";

import { useEffect, useRef, useState } from "react";

import { chat } from "@/lib/api/codingprofile";
import type { SourceRef } from "@/lib/api/types";

type Message = { role: "user" | "assistant"; text: string; sources?: SourceRef[]; error?: boolean };

const STORAGE_KEY = "leetpulse:chat:messages";

const SUGGESTIONS = [
  "What's my weakest topic right now?",
  "How's my streak trending this month?",
  "Which difficulty should I focus on next?",
  "Summarize my contest performance.",
];

function loadMessages(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch { /* quota exceeded — ignore */ }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedRef = useRef(false);

  // Restore messages from localStorage on mount
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      const saved = loadMessages();
      if (saved.length > 0) setMessages(saved);
    }
  }, []);

  // Persist messages to localStorage on change
  useEffect(() => {
    if (loadedRef.current && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    return () => { if (typingRef.current) clearInterval(typingRef.current); };
  }, []);

  function typewriterAppend(fullText: string, sources: SourceRef[], msgIndex: number) {
    let i = 0;
    const chunkSize = 3;
    const interval = 15;
    typingRef.current = setInterval(() => {
      i = Math.min(i + chunkSize, fullText.length);
      setMessages((m) => {
        const updated = [...m];
        updated[msgIndex] = { ...updated[msgIndex], text: fullText.slice(0, i), sources: i === fullText.length ? sources : updated[msgIndex].sources };
        return updated;
      });
      if (i >= fullText.length && typingRef.current) {
        clearInterval(typingRef.current);
        typingRef.current = null;
        setSending(false);
      }
    }, interval);
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setSending(true);

    const msgIndex = messages.length + 1;
    setMessages((m) => [...m, { role: "assistant", text: "" }]);

    try {
      const res = await chat(q);
      typewriterAppend(res.answer, res.sources, msgIndex);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      setMessages((m) => {
        const updated = [...m];
        updated[msgIndex] = { ...updated[msgIndex], text: msg, error: true };
        return updated;
      });
      setSending(false);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div style={{ padding: "36px 44px", display: "flex", flexDirection: "column", height: "100vh" }} className="animate-fadeup">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em" }}>Ask LeetPulse</div>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", padding: "3px 8px", borderRadius: 6, background: "linear-gradient(135deg, var(--accent-strong), var(--accent))", color: "white" }}>AI</span>
        {hasMessages && (
          <div
            onClick={() => { setMessages([]); localStorage.removeItem(STORAGE_KEY); }}
            style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-faint)", cursor: "pointer", padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)" }}
          >
            Clear history
          </div>
        )}
      </div>
      <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 20 }}>
        Grounded in your synced profile, snapshots, and skill breakdown — not generic advice.
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "radial-gradient(ellipse 900px 500px at 50% 0%, var(--accent-soft), transparent 65%), var(--surface)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden" }}>
        {!hasMessages ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "64px 40px 40px", gap: 24, overflowY: "auto" }}>
            <div style={{ maxWidth: 600, textAlign: "center", fontWeight: 700, fontSize: 28, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
              What do you want to know about your coding journey?
            </div>
            <ChatInput draft={draft} setDraft={setDraft} onSend={() => send(draft)} sending={sending} big />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 620 }}>
              {SUGGESTIONS.map((s) => (
                <div key={s} onClick={() => send(s)} style={{ padding: "9px 14px", border: "1px solid var(--border)", borderRadius: 20, fontSize: 12.5, color: "var(--text-dim)", cursor: "pointer", background: "var(--bg-elevated)" }}>
                  {s}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "26px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((msg, i) => (
                <MessageRow key={i} msg={msg} />
              ))}
              {sending && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.text === "" && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "15px 18px", borderRadius: "16px 16px 16px 4px", fontSize: 14, minHeight: 20 }}>
                    <span style={{ display: "inline-block", width: 6, height: 14, background: "var(--accent)", verticalAlign: "middle", animation: "pulseDot 0.8s ease infinite" }} />
                  </div>
                </div>
              )}
            </div>
            <div style={{ borderTop: "1px solid var(--border)", padding: "18px 22px" }}>
              <ChatInput draft={draft} setDraft={setDraft} onSend={() => send(draft)} sending={sending} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const pattern = /(\*\*(.+?)\*\*)|(\\\*(.+?)\\\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIdx = 0;
  let match;

  while ((match = pattern.exec(remaining)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(remaining.slice(lastIdx, match.index));
    }
    if (match[1]) {
      nodes.push(<strong key={key++} style={{ fontWeight: 700 }}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(match[4]);
    } else if (match[5]) {
      nodes.push(<em key={key++} style={{ fontStyle: "italic" }}>{match[6]}</em>);
    } else if (match[7]) {
      nodes.push(
        <code
          key={key++}
          style={{
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            background: "var(--bg-elevated, rgba(0,0,0,0.06))",
          }}
        >
          {match[8]}
        </code>,
      );
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < remaining.length) {
    nodes.push(remaining.slice(lastIdx));
  }
  return nodes;
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizes: Record<number, { size: number; weight: number }> = {
        1: { size: 18, weight: 800 },
        2: { size: 16, weight: 700 },
        3: { size: 15, weight: 700 },
      };
      const s = sizes[level] || sizes[3];
      blocks.push(
        <div key={i} style={{ fontSize: s.size, fontWeight: s.weight, marginTop: i > 0 ? 10 : 0, marginBottom: 4, letterSpacing: "-0.01em" }}>
          {renderInline(headingMatch[2])}
        </div>,
      );
      i++;
      continue;
    }

    const codeMatch = line.match(/^```/);
    if (codeMatch) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre
          key={i}
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            fontSize: 12.5,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            background: "var(--bg-elevated, rgba(0,0,0,0.04))",
            overflow: "auto",
            margin: "6px 0",
            lineHeight: 1.5,
          }}
        >
          {codeLines.join("\n")}
        </pre>,
      );
      continue;
    }

    if (/^[\-\*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-\*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\-\*]\s+/, ""));
        i++;
      }
      blocks.push(
        <div key={`list-${i}`} style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2, margin: "4px 0" }}>
          {items.map((item, j) => (
            <div key={j} style={{ display: "flex", gap: 8, lineHeight: 1.6 }}>
              <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{renderInline(item)}</span>
            </div>
          ))}
        </div>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: { num: string; text: string }[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\d+)\.\s+(.*)/);
        if (m) items.push({ num: m[1], text: m[2] });
        i++;
      }
      blocks.push(
        <div key={`ol-${i}`} style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2, margin: "4px 0" }}>
          {items.map((item, j) => (
            <div key={j} style={{ display: "flex", gap: 8, lineHeight: 1.6 }}>
              <span style={{ color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>{item.num}.</span>
              <span>{renderInline(item.text)}</span>
            </div>
          ))}
        </div>,
      );
      continue;
    }

    if (line.trim() === "") {
      blocks.push(<div key={i} style={{ height: 6 }} />);
      i++;
      continue;
    }

    blocks.push(
      <div key={i} style={{ lineHeight: 1.6 }}>
        {renderInline(line)}
      </div>,
    );
    i++;
  }

  return <>{blocks}</>;
}

function MessageRow({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "78%" }}>
        <div
          style={{
            padding: "12px 16px",
            fontSize: 14,
            lineHeight: 1.6,
            wordBreak: "break-word",
            background: isUser ? "var(--accent)" : msg.error ? "var(--hard-soft)" : "var(--surface)",
            color: isUser ? "white" : msg.error ? "var(--hard)" : "var(--text)",
            border: isUser ? "none" : "1px solid var(--border)",
            borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          }}
        >
          {isUser ? msg.text : <MarkdownContent text={msg.text} />}
        </div>
        {msg.sources && msg.sources.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 4, marginTop: 6 }}>
            {msg.sources.map((src) => (
              <span key={src.chunkId} className="font-mono" style={{ fontSize: 10.5, color: "var(--text-faint)", background: "var(--surface-2)", padding: "3px 8px", borderRadius: 6 }} title={src.chunkId}>{src.label}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatInput({ draft, setDraft, onSend, sending, big }: { draft: string; setDraft: (v: string) => void; onSend: () => void; sending: boolean; big?: boolean }) {
  return (
    <div style={{ width: "100%", maxWidth: big ? 620 : undefined, display: "flex", gap: 10, alignItems: "center", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: big ? 14 : 12, padding: big ? "8px 8px 8px 18px" : 0 }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        placeholder="Ask about your progress, weak topics, streaks…"
        style={{ flex: 1, padding: big ? "10px 0" : "13px 16px", background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: big ? 15 : 14, fontFamily: "inherit" }}
      />
      <button
        onClick={onSend}
        disabled={sending || !draft.trim()}
        style={{ padding: big ? "11px 16px" : "13px 18px", background: "var(--accent)", color: "white", border: "none", borderRadius: big ? 10 : 12, fontWeight: 700, fontSize: 13, cursor: sending || !draft.trim() ? "default" : "pointer", opacity: sending || !draft.trim() ? 0.6 : 1, flexShrink: 0, fontFamily: "inherit" }}
      >
        Send
      </button>
    </div>
  );
}
