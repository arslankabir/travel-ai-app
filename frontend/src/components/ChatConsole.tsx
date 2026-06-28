"use client";

import { useEffect, useRef, useState } from "react";

import AgentPipeline, {
  markNodeDone,
  markNodeStarted,
  markPipelineComplete,
  initPipeline,
  LoadingStatus,
  PipelineStep,
} from "@/components/AgentPipeline";
import { fetchTrace, streamChat, SSEPayload } from "@/lib/sse";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function isListingsMessage(text: string) {
  return text.includes("Found") && text.includes("matching stays");
}

function isReviewSummaryMessage(text: string) {
  return text.includes("Review insights");
}

export default function ChatConsole() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [awaitingReview, setAwaitingReview] = useState(false);
  const [afterListings, setAfterListings] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [citations, setCitations] = useState<
    Array<{ review_id: string; listing_id: string; quote: string; listing_name?: string }>
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const streamBuffer = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, citations, pipelineSteps, streaming, awaitingReview, afterListings]);

  const finishReviewPhase = () => {
    setAwaitingReview(false);
    setAfterListings(false);
  };

  const handleEvent = (event: SSEPayload) => {
    if (event.event === "trace_init" && event.request_id) {
      setRequestId(event.request_id);
      return;
    }

    if (event.event === "node_start" && event.node) {
      if (event.node === "review_agent") {
        setAwaitingReview(true);
        setAfterListings(false);
      }
      setPipelineSteps((prev) => markNodeStarted(prev, event.node!));
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

      if (isListingsMessage(event.text)) {
        setPipelineSteps((prev) => markNodeDone(prev, "retrieval_agent"));
        setAfterListings(true);
      }
      if (isReviewSummaryMessage(event.text)) {
        finishReviewPhase();
      }
      return;
    }

    if (event.event === "itinerary" && event.text) {
      finishReviewPhase();
      setMessages((prev) => [...prev, { role: "assistant", content: event.text! }]);
      return;
    }

    if (event.event === "citations_loaded" && event.citations) {
      setCitations(event.citations);
      finishReviewPhase();
      return;
    }

    if (event.event === "complete") {
      setPipelineSteps((prev) => markPipelineComplete(prev));
      finishReviewPhase();
      return;
    }

    if (event.event === "error") {
      finishReviewPhase();
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
    setPipelineSteps(initPipeline());
    setCitations([]);
    setAwaitingReview(false);
    setAfterListings(false);
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
      finishReviewPhase();
      setPipelineSteps((prev) => markPipelineComplete(prev));
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

  const showLoading = streaming && (awaitingReview || afterListings || pipelineSteps.some((s) => s.status === "running"));

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
        <div className="fixed bottom-20 right-5 z-50 flex h-[min(70vh,520px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="font-semibold text-zinc-900">Travel concierge</h2>
            <p className="text-xs text-zinc-500">Multi-agent search, reviews & itineraries</p>
          </div>

          <AgentPipeline steps={pipelineSteps} streaming={streaming} />

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
            {messages.length === 0 && !streaming && (
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
            {showLoading && (
              <LoadingStatus
                steps={pipelineSteps}
                streaming={streaming}
                awaitingReview={awaitingReview}
                afterListings={afterListings}
              />
            )}
            {citations.length > 0 && (
              <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-2 text-xs">
                <p className="mb-1 font-medium text-zinc-800">Source reviews (click to open)</p>
                <ul className="space-y-1">
                  {citations.map((c) => (
                    <li key={c.review_id}>
                      <a
                        href={`/property/${c.listing_id}#review-${c.review_id}`}
                        className="font-medium text-rose-700 underline"
                      >
                        {c.listing_name ?? `Listing ${c.listing_id}`}
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
                {streaming ? "…" : "Send"}
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
