"use client";

import { useRef, useState } from "react";

import { fetchTrace, streamChat, SSEPayload } from "@/lib/sse";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ChatConsole() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [citations, setCitations] = useState<
    Array<{ review_id: number; listing_id: number; quote: string }>
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const streamBuffer = useRef("");

  const handleEvent = (event: SSEPayload) => {
    if (event.event === "trace_init" && event.request_id) {
      setRequestId(event.request_id);
      return;
    }
    if (event.event === "node_start" && event.node) {
      setSteps((prev) => [...prev, event.node!]);
      return;
    }
    if (event.event === "token" && event.token) {
      streamBuffer.current += event.token;
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = { role: "assistant", content: streamBuffer.current };
        } else {
          copy.push({ role: "assistant", content: streamBuffer.current });
        }
        return copy;
      });
      return;
    }
    if (event.event === "message" && event.text) {
      streamBuffer.current = "";
      setMessages((prev) => [...prev, { role: "assistant", content: event.text! }]);
      return;
    }
    if (event.event === "itinerary" && event.text) {
      setMessages((prev) => [...prev, { role: "assistant", content: event.text! }]);
    }
    if (event.event === "citations_loaded" && event.citations) {
      setCitations(event.citations);
    }
    if (event.event === "error") {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠ ${event.message ?? "Something went wrong"}` },
      ]);
    }
  };

  const send = async () => {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    setSteps([]);
    setCitations([]);
    streamBuffer.current = "";
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    setStreaming(true);
    abortRef.current = new AbortController();

    try {
      await streamChat(text, "concierge", handleEvent, abortRef.current.signal);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: err.message }]);
      }
    } finally {
      setStreaming(false);
      streamBuffer.current = "";
    }
  };

  const loadTrace = async () => {
    if (!requestId) return;
    try {
      const trace = await fetchTrace(requestId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Trace: ${trace.total_latency_ms}ms, tokens: ${JSON.stringify(trace.token_usage)}`,
        },
      ]);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-lg"
      >
        {open ? "Close concierge" : "AI Concierge"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[min(70vh,520px)] w-[min(92vw,400px)] flex-col rounded-xl border border-zinc-200 bg-white shadow-2xl">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="font-semibold text-zinc-900">Travel concierge</h2>
            <p className="text-xs text-zinc-500">Multi-agent search, reviews & itineraries</p>
          </div>

          {steps.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-zinc-100 px-3 py-2">
              {steps.map((step, i) => (
                <span key={`${step}-${i}`} className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600">
                  {step}
                </span>
              ))}
            </div>
          )}

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
            {messages.length === 0 && (
              <p className="text-zinc-400">Ask about stays, reviews, or trip plans…</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap rounded-lg px-3 py-2 ${
                  m.role === "user" ? "ml-6 bg-rose-50 text-zinc-800" : "mr-6 bg-zinc-50 text-zinc-800"
                }`}
              >
                {m.content}
              </div>
            ))}
            {citations.length > 0 && (
              <div className="rounded-lg bg-zinc-50 p-2 text-xs">
                <p className="mb-1 font-medium text-zinc-700">Citations</p>
                <ul className="space-y-1">
                  {citations.map((c) => (
                    <li key={c.review_id}>
                      <a
                        href={`/property/${c.listing_id}#review-${c.review_id}`}
                        className="text-rose-700 underline"
                      >
                        Listing {c.listing_id} · review {c.review_id}
                      </a>
                      <span className="text-zinc-500"> — “{c.quote.slice(0, 80)}…”</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-200 p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Plan a trip or compare reviews…"
                className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                disabled={streaming}
              />
              <button
                type="button"
                onClick={send}
                disabled={streaming || !input.trim()}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
            {requestId && (
              <button
                type="button"
                onClick={loadTrace}
                className="mt-2 text-[10px] text-zinc-400 underline"
              >
                View trace ({requestId.slice(0, 8)}…)
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
