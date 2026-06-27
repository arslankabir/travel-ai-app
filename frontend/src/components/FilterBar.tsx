"use client";

import { AMENITIES, CITIES, SORT_OPTIONS, SearchFilters, SortOption } from "@/lib/api";

interface FilterBarProps {
  filters: SearchFilters;
  useMapBounds: boolean;
  onUseMapBoundsChange: (enabled: boolean) => void;
  onChange: (next: SearchFilters) => void;
  loading?: boolean;
}

function numOrUndefined(value: string): number | undefined {
  if (value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default function FilterBar({
  filters,
  useMapBounds,
  onUseMapBoundsChange,
  onChange,
  loading,
}: FilterBarProps) {
  const patch = (partial: Partial<SearchFilters>) => {
    onChange({ ...filters, ...partial, offset: 0 });
  };

  return (
    <div className="border-b border-zinc-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          City
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.city ?? ""}
            onChange={(e) => patch({ city: e.target.value || undefined })}
          >
            <option value="">All cities</option>
            {CITIES.map((city) => (
              <option key={city} value={city}>
                {city.charAt(0).toUpperCase() + city.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Check-in
          <input
            type="date"
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.check_in ?? ""}
            onChange={(e) => patch({ check_in: e.target.value || undefined })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Check-out
          <input
            type="date"
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.check_out ?? ""}
            onChange={(e) => patch({ check_out: e.target.value || undefined })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Guests
          <input
            type="number"
            min={1}
            className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.accommodates ?? ""}
            onChange={(e) => patch({ accommodates: numOrUndefined(e.target.value) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Bedrooms
          <input
            type="number"
            min={0}
            className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.bedrooms ?? ""}
            onChange={(e) => patch({ bedrooms: numOrUndefined(e.target.value) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Min price
          <input
            type="number"
            min={0}
            className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.min_price ?? ""}
            onChange={(e) => patch({ min_price: numOrUndefined(e.target.value) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Max price
          <input
            type="number"
            min={0}
            className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.max_price ?? ""}
            onChange={(e) => patch({ max_price: numOrUndefined(e.target.value) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Min rating
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.min_rating ?? ""}
            onChange={(e) => patch({ min_rating: numOrUndefined(e.target.value) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Amenity
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.amenity ?? ""}
            onChange={(e) => patch({ amenity: e.target.value || undefined })}
          >
            <option value="">Any</option>
            {AMENITIES.map((a) => (
              <option key={a} value={a}>
                {a.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          Sort
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={filters.sort ?? "rating_desc"}
            onChange={(e) => patch({ sort: e.target.value as SortOption })}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pb-1 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={useMapBounds}
            onChange={(e) => onUseMapBoundsChange(e.target.checked)}
          />
          Filter by map bounds
        </label>

        {loading && <span className="pb-1 text-xs text-zinc-500">Loading…</span>}
      </div>
    </div>
  );
}
