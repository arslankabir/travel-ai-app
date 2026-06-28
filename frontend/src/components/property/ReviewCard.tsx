"use client";

import { forwardRef } from "react";

import { ReviewItem } from "@/lib/api";
import { cn } from "@/lib/utils";

function reviewerInitials(name: string | null) {
  if (!name?.trim()) return "G";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatReviewDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

interface ReviewCardProps {
  review: ReviewItem;
  className?: string;
}

const ReviewCard = forwardRef<HTMLDivElement, ReviewCardProps>(function ReviewCard(
  { review, className },
  ref,
) {
  const displayName = review.reviewer_name?.trim() || "Guest";

  return (
    <article
      ref={ref}
      id={`review-${review.id}`}
      className={cn("scroll-mt-28 rounded-xl transition-shadow duration-300", className)}
    >
      <div className="flex gap-4">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white"
          aria-hidden
        >
          {reviewerInitials(review.reviewer_name)}
        </div>

        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-[15px] font-semibold leading-snug text-zinc-900">
              {displayName}
            </h3>
            {review.date && (
              <>
                <span className="text-zinc-300" aria-hidden>
                  ·
                </span>
                <time dateTime={review.date} className="text-sm text-zinc-500">
                  {formatReviewDate(review.date)}
                </time>
              </>
            )}
          </header>

          {review.language && (
            <p className="mt-0.5 text-xs text-zinc-400">
              Review in {review.language.toUpperCase()}
            </p>
          )}

          {review.comments && (
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-700">{review.comments}</p>
          )}

          {review.topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {review.topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] capitalize text-zinc-600"
                >
                  {topic.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
});

export default ReviewCard;
