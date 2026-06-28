"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ListingCard } from "@/lib/api";
import { getWishlist, removeFromWishlist } from "@/lib/wishlist";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function WishlistPage() {
  const [items, setItems] = useState<ListingCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setItems(getWishlist());
  }, []);

  function handleRemove(id: string) {
    setItems(removeFromWishlist(id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  }

  const compareHref =
    selected.size >= 2 ? `/compare?ids=${Array.from(selected).join(",")}` : null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm font-medium text-rose-600 hover:underline">
            ← Back to search
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900">Saved stays</h1>
          {compareHref ? (
            <Link href={compareHref} className="text-sm font-medium text-rose-600 hover:underline">
              Compare ({selected.size})
            </Link>
          ) : (
            <span className="text-xs text-zinc-400">Select 2–5 to compare</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No saved stays yet. Use the ♡ on search results to build your wishlist.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4"
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="rounded border-zinc-300"
                />
                <Link href={`/property/${item.id}`} className="flex min-w-0 flex-1 gap-3">
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                    {item.picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.picture_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">
                      {item.name ?? "Unnamed stay"}
                    </p>
                    <p className="text-sm text-zinc-500 capitalize">{item.city}</p>
                    <p className="text-sm font-semibold">{formatPrice(item.price)}/night</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="text-xs text-zinc-400 hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
