"use client";

import { useState } from "react";

import { SearchFilters } from "@/lib/api";
import { streamChat } from "@/lib/sse";

interface NaturalLanguageBarProps {
  onFiltersParsed: (filters: SearchFilters) => void;
}

function mapParsedToFilters(raw: Record<string, unknown>): SearchFilters {
  return {
    city: typeof raw.city === "string" ? raw.city : undefined,
    check_in: typeof raw.check_in === "string" ? raw.check_in : undefined,
    check_out: typeof raw.check_out === "string" ? raw.check_out : undefined,
    min_price: typeof raw.min_price === "number" ? raw.min_price : undefined,
    max_price: typeof raw.max_price === "number" ? raw.max_price : undefined,
    min_rating: typeof raw.min_rating === "number" ? raw.min_rating : undefined,
    accommodates: typeof raw.accommodates === "number" ? raw.accommodates : undefined,
    bedrooms: typeof raw.bedrooms === "number" ? raw.bedrooms : undefined,
    amenity: typeof raw.amenity === "string" ? raw.amenity : undefined,
    sort: "rating_desc",
    limit: 20,
    offset: 0,
  };
}

export default function NaturalLanguageBar({ onFiltersParsed }: NaturalLanguageBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsedChips, setParsedChips] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError(null);
    setParsedChips([]);

    try {
      await streamChat(query.trim(), "search", (event) => {
        if (event.event === "filters_parsed" && event.filters) {
          const mapped = mapParsedToFilters(event.filters);
          onFiltersParsed(mapped);
          const chips = Object.entries(event.filters)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => `${k}: ${v}`);
          setParsedChips(chips);
        }
        if (event.event === "error") {
          setError(event.message ?? "Search parse failed");
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search parse failed");
    } finally {
      setLoading(false);
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
        <div className="flex items-center gap-2">
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
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  );
}
