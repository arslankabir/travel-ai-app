"use client";

import { useCallback, useEffect, useState } from "react";

import FilterBar from "@/components/FilterBar";
import ListingList from "@/components/ListingList";
import MapView from "@/components/MapView";
import NaturalLanguageBar from "@/components/NaturalLanguageBar";
import ChatConsole from "@/components/ChatConsole";
import {
  fetchListings,
  ListingCard,
  SearchFilters,
} from "@/lib/api";

const DEFAULT_FILTERS: SearchFilters = {
  city: "lisbon",
  sort: "rating_desc",
  limit: 20,
  offset: 0,
};

export default function SearchPage() {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [useMapBounds, setUseMapBounds] = useState(false);
  const [mapBbox, setMapBbox] = useState<string | undefined>();
  const [items, setItems] = useState<ListingCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const active: SearchFilters = {
      ...filters,
      bbox: useMapBounds ? mapBbox : undefined,
    };
    try {
      const data = await fetchListings(active);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, [filters, mapBbox, useMapBounds]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBboxChange = useCallback((bbox: string | undefined) => {
    setMapBbox(bbox);
    if (useMapBounds) {
      setFilters((prev) => ({ ...prev, offset: 0 }));
    }
  }, [useMapBounds]);

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-zinc-900">Travel AI Search</h1>
        <p className="text-sm text-zinc-500">Filter stays and explore on the map</p>
      </header>

      <NaturalLanguageBar
        onFiltersParsed={(parsed) => setFilters((prev) => ({ ...prev, ...parsed, offset: 0 }))}
      />

      <FilterBar
        filters={filters}
        useMapBounds={useMapBounds}
        onUseMapBoundsChange={setUseMapBounds}
        onChange={setFilters}
        loading={loading}
      />

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="min-h-0 border-r border-zinc-200 bg-white">
          <ListingList
            items={items}
            total={total}
            limit={filters.limit ?? 20}
            offset={filters.offset ?? 0}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onPage={(offset) => setFilters((prev) => ({ ...prev, offset }))}
          />
        </div>
        <div className="min-h-[320px] lg:min-h-0">
          <MapView
            items={items}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onBboxChange={handleBboxChange}
          />
        </div>
      </div>

      <ChatConsole />
    </div>
  );
}
