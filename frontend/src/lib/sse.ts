export type SSEEventName =
  | "trace_init"
  | "node_start"
  | "token"
  | "filters_parsed"
  | "listings_loaded"
  | "citations_loaded"
  | "itinerary"
  | "message"
  | "complete"
  | "error";

export interface SSEPayload {
  event: SSEEventName;
  request_id?: string;
  node?: string;
  token?: string;
  filters?: Record<string, unknown>;
  listings?: unknown[];
  citations?: Array<{ review_id: number; listing_id: number; quote: string }>;
  text?: string;
  latency_ms?: number;
  message?: string;
  recoverable?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function streamChat(
  userInput: string,
  mode: "search" | "concierge",
  onEvent: (payload: SSEPayload) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_input: userInput, mode }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const payload = JSON.parse(line.slice(5).trim()) as SSEPayload;
        onEvent(payload);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

export async function fetchTrace(requestId: string) {
  const res = await fetch(`${API_BASE}/api/trace/${requestId}`);
  if (!res.ok) throw new Error(`Trace fetch failed (${res.status})`);
  return res.json();
}
