"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { CompareResponse, fetchCompare } from "@/lib/api";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function CompareContent() {
  const params = useSearchParams();
  const idsParam = params.get("ids") ?? "";
  const ids = idsParam.split(",").filter(Boolean);

  const [data, setData] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length < 2) {
      setError("Select 2–4 listings to compare.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchCompare(ids)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Compare failed"))
      .finally(() => setLoading(false));
  }, [idsParam]);

  const allAmenities = Array.from(
    new Set(data?.listings.flatMap((l) => l.amenities) ?? []),
  ).sort();

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-sm font-medium text-rose-600 hover:underline">
            ← Back to search
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900">Compare stays</h1>
          <span className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading && <p className="text-sm text-zinc-500">Generating comparison…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {data && (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <th className="px-4 py-3 text-left font-medium text-zinc-500"> </th>
                    {data.listings.map((l) => (
                      <th key={l.id} className="px-4 py-3 text-left font-medium text-zinc-900">
                        <Link href={`/property/${l.id}`} className="hover:text-rose-600 hover:underline">
                          {l.name ?? "Stay"}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr>
                    <td className="px-4 py-3 text-zinc-500">Price / night</td>
                    {data.listings.map((l) => (
                      <td key={l.id} className="px-4 py-3 font-semibold">
                        {formatPrice(l.price)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-zinc-500">Rating</td>
                    {data.listings.map((l) => (
                      <td key={l.id} className="px-4 py-3">
                        {l.review_scores_rating != null
                          ? `★ ${l.review_scores_rating.toFixed(1)} (${l.number_of_reviews})`
                          : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-zinc-500">Location</td>
                    {data.listings.map((l) => (
                      <td key={l.id} className="px-4 py-3 capitalize">
                        {[l.neighborhood, l.city].filter(Boolean).join(", ")}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-zinc-500">Guests / beds</td>
                    {data.listings.map((l) => (
                      <td key={l.id} className="px-4 py-3">
                        {l.accommodates ?? "—"} guests · {l.bedrooms ?? "—"} bd
                      </td>
                    ))}
                  </tr>
                  {allAmenities.map((amenity) => (
                    <tr key={amenity}>
                      <td className="px-4 py-3 capitalize text-zinc-500">
                        {amenity.replace(/_/g, " ")}
                      </td>
                      {data.listings.map((l) => (
                        <td key={l.id} className="px-4 py-3">
                          {l.amenities.includes(amenity) ? "✓" : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-5">
              <h2 className="font-semibold text-zinc-900">AI verdict</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                {data.verdict}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading…</div>}>
      <CompareContent />
    </Suspense>
  );
}
