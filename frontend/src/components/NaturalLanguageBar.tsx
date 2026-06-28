"use client";

import { useRef, useState, type MutableRefObject } from "react";

import { SearchFilters } from "@/lib/api";
import { streamChat } from "@/lib/sse";

interface NaturalLanguageBarProps {
  onFiltersParsed: (filters: Partial<SearchFilters>) => void;
  abortRef?: MutableRefObject<AbortController | null>;
}

const FILTER_KEYS = [
  "city",
  "check_in",
  "check_out",
  "min_price",
  "max_price",
  "min_rating",
  "accommodates",
  "bedrooms",
  "amenity",
] as const;

const CHIP_LABELS: Record<string, string> = {
  city: "City",
  check_in: "Check-in",
  check_out: "Check-out",
  min_price: "Min price",
  max_price: "Max price",
  min_rating: "Min rating",
  accommodates: "Guests",
  bedrooms: "Bedrooms",
  amenity: "Amenity",
};

function mapParsedToFilters(raw: Record<string, unknown>): Partial<SearchFilters> {
  const out: Partial<SearchFilters> = { offset: 0 };
  for (const key of FILTER_KEYS) {
    const value = raw[key];
    if (value !== null && value !== undefined && value !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function buildChips(raw: Record<string, unknown>): string[] {
  return FILTER_KEYS.filter((key) => {
    const value = raw[key];
    return value !== null && value !== undefined && value !== "";
  }).map((key) => `${CHIP_LABELS[key]}: ${raw[key]}`);
}

export default function NaturalLanguageBar({ onFiltersParsed, abortRef }: NaturalLanguageBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsedChips, setParsedChips] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const localAbortRef = useRef<AbortController | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    localAbortRef.current?.abort();
    abortRef?.current?.abort();
    const controller = new AbortController();
    localAbortRef.current = controller;
    if (abortRef) {
      abortRef.current = controller;
    }

    setLoading(true);
    setError(null);
    setHint(null);
    setParsedChips([]);

    const submitted = query.trim();

    try {
      let applied = false;
      await streamChat(submitted, "search", (event) => {
        if (event.event === "filters_parsed" && event.filters) {
          const mapped = mapParsedToFilters(event.filters);
          const chips = buildChips(event.filters);
          if (chips.length === 0) {
            setHint("Could not extract filters — try mentioning a city, price, or dates.");
            return;
          }
          onFiltersParsed(mapped);
          setParsedChips(chips);
          applied = true;
        }
        if (event.event === "error") {
          setError(event.message ?? "Search parse failed");
        }
      }, controller.signal);

      if (applied) {
        setQuery("");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Search parse failed");
    } finally {
      setLoading(false);
      if (localAbortRef.current === controller) {
        localAbortRef.current = null;
      }
    }
  };

  return (
    <div className="border-b border-zinc-200 bg-rose-50/40 px-4 py-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label className="text-xs font-medium text-zinc-600">
          Natural language search
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. quiet 1-bed in Lisbon under €130 with balcony for late June'
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Understanding…" : "Search with AI"}
          </button>
          {parsedChips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {parsedChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-white px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-zinc-200"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
        {hint && <p className="text-xs text-amber-700">{hint}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  );
}
