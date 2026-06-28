"use client";

import { cn } from "@/lib/utils";

interface RatingBreakdownProps {
  overall: number | null;
  reviewCount: number;
  aspects: Array<{ label: string; score: number | null }>;
  className?: string;
}

function barWidth(score: number) {
  const normalized = score <= 5 ? score / 5 : score / 100;
  return `${Math.min(100, Math.max(0, normalized * 100))}%`;
}

function StarRow({ filled }: { filled: number }) {
  return (
    <span className="inline-flex gap-0.5 text-zinc-900" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={cn("text-sm", i < filled ? "text-zinc-900" : "text-zinc-300")}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function RatingBreakdown({
  overall,
  reviewCount,
  aspects,
  className,
}: RatingBreakdownProps) {
  const visible = aspects.filter((a) => a.score != null);
  if (overall == null && visible.length === 0) return null;

  const starFill = overall != null ? Math.round(overall <= 5 ? overall : overall / 20) : 0;

  return (
    <div
      className={cn(
        "grid gap-8 border-b border-zinc-200 pb-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]",
        className,
      )}
    >
      {overall != null && (
        <div className="flex items-start gap-4">
          <div className="flex items-center gap-2">
            <span className="text-5xl font-semibold leading-none tracking-tight text-zinc-900">
              {overall.toFixed(2)}
            </span>
            <StarRow filled={starFill} />
          </div>
          <div className="pt-1">
            <p className="text-sm font-medium text-zinc-900">
              {reviewCount.toLocaleString()} review{reviewCount === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">Guest favourite scores</p>
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map(({ label, score }) =>
            score != null ? (
              <li key={label} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
                <span className="text-sm text-zinc-700">{label}</span>
                <span className="text-sm font-medium tabular-nums text-zinc-900">
                  {score.toFixed(1)}
                </span>
                <div className="col-span-2 h-1 overflow-hidden rounded-full bg-zinc-200">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-all"
                    style={{ width: barWidth(score) }}
                  />
                </div>
              </li>
            ) : null,
          )}
        </ul>
      )}
    </div>
  );
}
