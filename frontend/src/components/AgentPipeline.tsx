"use client";

export type StepStatus = "pending" | "running" | "done" | "skipped";

export interface PipelineStep {
  id: string;
  label: string;
  loadingText: string;
  status: StepStatus;
}

export const AGENT_META: Record<
  string,
  { label: string; loadingText: string; doneText: string }
> = {
  intent_agent: {
    label: "Intent",
    loadingText: "Understanding your request…",
    doneText: "Request understood",
  },
  retrieval_agent: {
    label: "Search",
    loadingText: "Searching matching stays…",
    doneText: "Stays found",
  },
  review_agent: {
    label: "Reviews",
    loadingText: "Analyzing guest reviews…",
    doneText: "Review insights ready",
  },
  itinerary_agent: {
    label: "Itinerary",
    loadingText: "Building your trip plan…",
    doneText: "Itinerary ready",
  },
};

/** Typical concierge order — steps not reached are marked skipped on complete. */
export const CONCIERGE_ORDER = [
  "intent_agent",
  "retrieval_agent",
  "review_agent",
  "itinerary_agent",
];

export function initPipeline(): PipelineStep[] {
  return CONCIERGE_ORDER.map((id) => ({
    id,
    label: AGENT_META[id].label,
    loadingText: AGENT_META[id].loadingText,
    status: "pending" as StepStatus,
  }));
}

export function markNodeStarted(steps: PipelineStep[], nodeId: string): PipelineStep[] {
  const idx = steps.findIndex((s) => s.id === nodeId);
  if (idx === -1) return steps;

  return steps.map((step, i) => {
    if (i < idx && step.status === "running") return { ...step, status: "done" };
    if (i < idx && step.status === "pending") return { ...step, status: "skipped" };
    if (i === idx) return { ...step, status: "running" };
    return step;
  });
}

export function markNodeDone(steps: PipelineStep[], nodeId: string): PipelineStep[] {
  return steps.map((step) =>
    step.id === nodeId && step.status === "running"
      ? { ...step, status: "done" }
      : step,
  );
}

export function markPipelineComplete(steps: PipelineStep[]): PipelineStep[] {
  return steps.map((step) => {
    if (step.status === "running") return { ...step, status: "done" };
    if (step.status === "pending") return { ...step, status: "skipped" };
    return step;
  });
}

export function getActiveStep(steps: PipelineStep[]): PipelineStep | undefined {
  return steps.find((s) => s.status === "running");
}

export function getRemainingLabels(steps: PipelineStep[]): string[] {
  const activeIdx = steps.findIndex((s) => s.status === "running");
  if (activeIdx === -1) return [];
  return steps
    .slice(activeIdx + 1)
    .filter((s) => s.status === "pending")
    .map((s) => s.label.toLowerCase());
}

interface AgentPipelineProps {
  steps: PipelineStep[];
  streaming: boolean;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
        ✓
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-40" />
        <span className="relative h-3 w-3 rounded-full bg-rose-500" />
      </span>
    );
  }
  if (status === "skipped") {
    return <span className="h-5 w-5 rounded-full border border-zinc-200 bg-zinc-50" />;
  }
  return <span className="h-5 w-5 rounded-full border-2 border-zinc-200 bg-white" />;
}

export default function AgentPipeline({ steps, streaming }: AgentPipelineProps) {
  const visible = steps.some((s) => s.status !== "pending") || streaming;
  if (!visible) return null;

  return (
    <div className="border-b border-zinc-100 bg-gradient-to-r from-rose-50/80 via-white to-zinc-50 px-3 py-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        AI pipeline
      </p>
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {steps.map((step, i) => (
          <div key={step.id} className="flex shrink-0 items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors ${
                step.status === "running"
                  ? "bg-rose-100 ring-1 ring-rose-200"
                  : step.status === "done"
                    ? "bg-emerald-50"
                    : step.status === "skipped"
                      ? "opacity-40"
                      : "bg-zinc-50"
              }`}
            >
              <StepIcon status={step.status} />
              <span
                className={`text-[11px] font-medium ${
                  step.status === "running"
                    ? "text-rose-800"
                    : step.status === "done"
                      ? "text-emerald-800"
                      : "text-zinc-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={`mx-0.5 text-[10px] ${
                  step.status === "done" ? "text-emerald-400" : "text-zinc-300"
                }`}
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface LoadingStatusProps {
  steps: PipelineStep[];
  streaming: boolean;
  awaitingReview: boolean;
  afterListings: boolean;
}

export function LoadingStatus({
  steps,
  streaming,
  awaitingReview,
  afterListings,
}: LoadingStatusProps) {
  const active = getActiveStep(steps);
  const remaining = getRemainingLabels(steps);

  const show = streaming && (awaitingReview || afterListings || Boolean(active));
  if (!show) return null;

  let loadingText = "Starting AI agents…";
  let upNext: string[] = remaining;

  if (awaitingReview) {
    loadingText = "Analyzing guest reviews…";
    upNext = ["review summary", "source links"];
  } else if (afterListings) {
    loadingText = "Preparing review analysis…";
    upNext = ["guest reviews", "review summary", "source links"];
  } else if (active?.id === "itinerary_agent") {
    return null;
  } else if (active) {
    loadingText = AGENT_META[active.id]?.loadingText ?? "Processing…";
  }

  return (
    <div className="mr-6 flex items-start gap-2 rounded-lg border border-dashed border-rose-200 bg-rose-50/60 px-3 py-2.5 text-sm text-zinc-700">
      <span className="mt-0.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-rose-300 border-t-rose-600" />
      <div>
        <p className="font-medium text-zinc-800">{loadingText}</p>
        {upNext.length > 0 && (
          <p className="mt-0.5 text-xs text-zinc-500">Up next: {upNext.join(", ")}</p>
        )}
      </div>
    </div>
  );
}
