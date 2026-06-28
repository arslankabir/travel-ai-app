"use client";

import { useMemo, useState } from "react";

import ReviewCard from "@/components/property/ReviewCard";
import { ReviewItem } from "@/lib/api";

const PAGE_SIZE = 6;

interface PropertyReviewsProps {
  reviews: ReviewItem[];
  highlightReviewId?: string | null;
}

export default function PropertyReviews({ reviews, highlightReviewId }: PropertyReviewsProps) {
  const [langFilter, setLangFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const languages = useMemo(
    () =>
      Array.from(
        new Set(reviews.map((r) => r.language).filter((l): l is string => Boolean(l))),
      ).sort(),
    [reviews],
  );

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const r of reviews) {
      for (const t of r.topics) set.add(t);
    }
    return Array.from(set).sort();
  }, [reviews]);

  const filtered = useMemo(
    () =>
      reviews.filter((r) => {
        if (langFilter && r.language !== langFilter) return false;
        if (topicFilter && !r.topics.includes(topicFilter)) return false;
        return true;
      }),
    [reviews, langFilter, topicFilter],
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-zinc-900">
            {filtered.length.toLocaleString()} review{filtered.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Filter by language or topic
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={langFilter}
            onChange={(e) => {
              setLangFilter(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="">All languages</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={topicFilter}
            onChange={(e) => {
              setTopicFilter(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(langFilter || topicFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">Active filters:</span>
          {langFilter && (
            <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600">
              {langFilter.toUpperCase()}
            </span>
          )}
          {topicFilter && (
            <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs capitalize text-zinc-600">
              {topicFilter.replace(/_/g, " ")}
            </span>
          )}
          <button
            type="button"
            className="text-xs text-zinc-500 underline"
            onClick={() => {
              setLangFilter("");
              setTopicFilter("");
              setVisibleCount(PAGE_SIZE);
            }}
          >
            Clear
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500">
          No reviews match these filters.
        </p>
      ) : (
        <>
          <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
            {visible.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                className={
                  highlightReviewId === review.id
                    ? "rounded-xl bg-rose-50/80 p-4 ring-2 ring-rose-300"
                    : undefined
                }
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-900 px-6 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Show more reviews ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
