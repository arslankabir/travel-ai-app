"use client";

import Link from "next/link";
import { ListingCard } from "@/lib/api";

interface ListingListProps {
  items: ListingCard[];
  total: number;
  limit: number;
  offset: number;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onPage: (offset: number) => void;
  compareIds: Set<string>;
  onToggleCompare: (item: ListingCard) => void;
  wishlistIds: Set<string>;
  onToggleWishlist: (item: ListingCard) => void;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function ListingList({
  items,
  total,
  limit,
  offset,
  hoveredId,
  onHover,
  onPage,
  compareIds,
  onToggleCompare,
  wishlistIds,
  onToggleWishlist,
}: ListingListProps) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-2 text-sm text-zinc-600">
        {total.toLocaleString()} stays
        {total > 0 && (
          <span className="text-zinc-400">
            {" "}
            · page {page} of {totalPages}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No listings match your filters.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {items.map((item) => {
              const active = hoveredId === item.id;
              const inCompare = compareIds.has(item.id);
              const saved = wishlistIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className={`transition-colors ${
                    active ? "bg-rose-50" : "hover:bg-zinc-50"
                  }`}
                  onMouseEnter={() => onHover(item.id)}
                  onMouseLeave={() => onHover(null)}
                >
                  <div className="flex gap-2 p-4">
                    <label className="flex shrink-0 cursor-pointer items-start pt-1">
                      <input
                        type="checkbox"
                        checked={inCompare}
                        onChange={() => onToggleCompare(item)}
                        className="mt-1 rounded border-zinc-300"
                        title="Add to compare"
                      />
                    </label>
                    <Link href={`/property/${item.id}`} className="flex min-w-0 flex-1 gap-3">
                      <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                        {item.picture_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.picture_url}
                            alt={item.name ?? "Listing photo"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                            No photo
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate font-medium text-zinc-900">
                            {item.name ?? "Unnamed stay"}
                          </h3>
                          <span className="shrink-0 font-semibold text-zinc-900">
                            {formatPrice(item.price)}
                            <span className="text-xs font-normal text-zinc-500"> / night</span>
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-zinc-500">
                          {[item.neighborhood, item.city, item.room_type]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                          {item.review_scores_rating != null && (
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5">
                              ★ {item.review_scores_rating.toFixed(1)}
                            </span>
                          )}
                          <span>{item.number_of_reviews} reviews</span>
                          {item.accommodates != null && <span>{item.accommodates} guests</span>}
                          {item.bedrooms != null && <span>{item.bedrooms} bd</span>}
                        </div>
                        {item.amenities.length > 0 && (
                          <p className="mt-1 truncate text-xs text-zinc-400">
                            {item.amenities.slice(0, 4).join(" · ")}
                          </p>
                        )}
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(item)}
                      className={`shrink-0 self-start rounded-full p-1.5 text-lg leading-none ${
                        saved ? "text-rose-600" : "text-zinc-300 hover:text-rose-400"
                      }`}
                      title={saved ? "Remove from wishlist" : "Save to wishlist"}
                    >
                      {saved ? "♥" : "♡"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onPage(Math.max(0, offset - limit))}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onPage(offset + limit)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
