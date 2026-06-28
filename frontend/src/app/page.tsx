"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import FilterBar from "@/components/FilterBar";
import ListingList from "@/components/ListingList";
import MapView, { MapViewHandle } from "@/components/MapView";
import NaturalLanguageBar from "@/components/NaturalLanguageBar";
import ChatConsole from "@/components/ChatConsole";
import {
  fetchListings,
  fetchListingsByIds,
  ListingCard,
  SearchFilters,
} from "@/lib/api";
import { getWishlist, toggleWishlist } from "@/lib/wishlist";

const DEFAULT_FILTERS: SearchFilters = {
  city: "lisbon",
  sort: "rating_desc",
  limit: 20,
  offset: 0,
};

const MAX_COMPARE = 5;

export default function SearchPage() {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [useMapBounds, setUseMapBounds] = useState(false);
  const [mapBbox, setMapBbox] = useState<string | undefined>();
  const [items, setItems] = useState<ListingCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [conciergeBanner, setConciergeBanner] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"search" | "concierge">("search");
  const nlAbortRef = useRef<AbortController | null>(null);
  const mapRef = useRef<MapViewHandle>(null);

  useEffect(() => {
    setWishlistIds(new Set(getWishlist().map((x) => x.id)));
  }, []);

  const handleNlFilters = useCallback((parsed: Partial<SearchFilters>) => {
    nlAbortRef.current?.abort();
    setUseMapBounds(false);
    setConciergeBanner(null);
    setViewMode("search");
    setFilters({
      sort: "rating_desc",
      limit: 20,
      offset: 0,
      city: parsed.city,
      check_in: parsed.check_in,
      check_out: parsed.check_out,
      min_price: parsed.min_price,
      max_price: parsed.max_price,
      min_rating: parsed.min_rating,
      accommodates: parsed.accommodates,
      bedrooms: parsed.bedrooms,
      amenity: parsed.amenity,
    });
  }, []);

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
    if (viewMode !== "search") return;
    void load();
  }, [load, viewMode]);

  const handleBboxChange = useCallback((bbox: string | undefined) => {
    setMapBbox(bbox);
    if (useMapBounds) {
      setFilters((prev) => ({ ...prev, offset: 0 }));
    }
  }, [useMapBounds]);

  const handleToggleCompare = useCallback((item: ListingCard) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else if (next.size < MAX_COMPARE) {
        next.add(item.id);
      }
      return next;
    });
  }, []);

  const handleToggleWishlist = useCallback((item: ListingCard) => {
    const next = toggleWishlist(item);
    setWishlistIds(new Set(next.map((x) => x.id)));
  }, []);

  const handleConciergeListings = useCallback(
    async (hits: Array<{ id: string; city: string }>) => {
      if (!hits.length) return;
      const ids = hits.map((h) => h.id);
      setLoading(true);
      setError(null);
      try {
        const data = await fetchListingsByIds(ids);
        setViewMode("concierge");
        setUseMapBounds(false);
        setItems(data.items);
        setTotal(data.items.length);
        setFilters((prev) => ({
          ...prev,
          city: hits[0]?.city ?? prev.city,
          offset: 0,
        }));
        setConciergeBanner(`Showing ${data.items.length} stays from concierge on map & list`);
        window.requestAnimationFrame(() => {
          mapRef.current?.fitToListings(data.items);
          window.setTimeout(() => mapRef.current?.fitToListings(data.items), 200);
        });
      } catch (err) {
        setConciergeBanner(null);
        setError(err instanceof Error ? err.message : "Failed to load concierge stays");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const exitConciergeView = useCallback(() => {
    setConciergeBanner(null);
    setViewMode("search");
  }, []);

  const compareHref =
    compareIds.size >= 2 ? `/compare?ids=${Array.from(compareIds).join(",")}` : null;

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Travel AI Search</h1>
            <p className="text-sm text-zinc-500">Filter stays and explore on the map</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/wishlist" className="text-zinc-600 hover:text-rose-600">
              Saved ({wishlistIds.size})
            </Link>
            {compareHref && (
              <Link
                href={compareHref}
                className="rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
              >
                Compare {compareIds.size}
              </Link>
            )}
          </div>
        </div>
      </header>

      <NaturalLanguageBar
        onFiltersParsed={handleNlFilters}
        abortRef={nlAbortRef}
      />

      <FilterBar
        filters={filters}
        useMapBounds={useMapBounds}
        onUseMapBoundsChange={setUseMapBounds}
        onChange={(next) => {
          exitConciergeView();
          setFilters(next);
        }}
        loading={loading}
      />

      {conciergeBanner && (
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          {conciergeBanner}
          <button
            type="button"
            onClick={exitConciergeView}
            className="ml-3 text-xs text-rose-600 underline"
          >
            Back to search
          </button>
        </div>
      )}

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
            onPage={(offset) => {
              exitConciergeView();
              setFilters((prev) => ({ ...prev, offset }));
            }}
            showPagination={viewMode === "search"}
            compareIds={compareIds}
            onToggleCompare={handleToggleCompare}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
          />
        </div>
        <div className="min-h-[320px] lg:min-h-0">
          <MapView
            ref={mapRef}
            items={items}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onBboxChange={handleBboxChange}
          />
        </div>
      </div>

      <ChatConsole onListingsLoaded={handleConciergeListings} />
    </div>
  );
}
