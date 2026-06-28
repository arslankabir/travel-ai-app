"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import PropertyMap from "@/components/PropertyMap";
import { fetchListingDetail, ListingDetail } from "@/lib/api";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(checkIn + "T00:00:00");
  const end = new Date(checkOut + "T00:00:00");
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export default function PropertyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [langFilter, setLangFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [checkIn, setCheckIn] = useState(searchParams.get("check_in") ?? "");
  const [checkOut, setCheckOut] = useState(searchParams.get("check_out") ?? "");

  const reviewRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!id) {
      setError("Invalid listing id");
      setLoading(false);
      return;
    }
    fetchListingDetail(id)
      .then(setListing)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!listing || typeof window === "undefined") return;
    const hash = window.location.hash;
    const match = hash.match(/^#review-(\d+)$/);
    if (!match) return;
    const reviewId = match[1];
    const el = reviewRefs.current[reviewId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-rose-400");
      const t = setTimeout(() => el.classList.remove("ring-2", "ring-rose-400"), 2500);
      return () => clearTimeout(t);
    }
  }, [listing]);

  const languages = useMemo(() => {
    if (!listing) return [];
    return Array.from(
      new Set(
        listing.reviews
          .map((r) => r.language)
          .filter((l): l is string => Boolean(l)),
      ),
    );
  }, [listing]);

  const topics = useMemo(() => {
    if (!listing) return [];
    const set = new Set<string>();
    for (const r of listing.reviews) {
      for (const t of r.topics) set.add(t);
    }
    return Array.from(set).sort();
  }, [listing]);

  const filteredReviews = useMemo(() => {
    if (!listing) return [];
    return listing.reviews.filter((r) => {
      if (langFilter && r.language !== langFilter) return false;
      if (topicFilter && !r.topics.includes(topicFilter)) return false;
      return true;
    });
  }, [listing, langFilter, topicFilter]);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const subtotal = listing && nights > 0 ? listing.price * nights : 0;
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

  function handleReserve() {
    if (!listing || nights <= 0) return;
    const qs = new URLSearchParams({
      listing_id: listing.id,
      name: listing.name ?? "Stay",
      city: listing.city,
      check_in: checkIn,
      check_out: checkOut,
      nights: String(nights),
      total: total.toFixed(2),
    });
    router.push(`/booking/confirm?${qs.toString()}`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-8 text-sm text-zinc-500">Loading property…</div>
    );
  }

  if (error || !listing) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <p className="text-sm text-red-600">{error ?? "Not found"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-rose-600 hover:underline">
          ← Back to search
        </Link>
      </div>
    );
  }

  const aspectEntries = [
    ["Cleanliness", listing.aspects.cleanliness],
    ["Location", listing.aspects.location],
    ["Value", listing.aspects.value],
    ["Communication", listing.aspects.communication],
    ["Check-in", listing.aspects.checkin],
  ] as const;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="text-sm font-medium text-rose-600 hover:underline">
            ← Back to search
          </Link>
          <span className="text-xs uppercase tracking-wide text-zinc-400">Travel AI</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="overflow-hidden rounded-xl bg-zinc-200">
          {listing.picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.picture_url}
              alt={listing.name ?? "Property"}
              className="h-72 w-full object-cover md:h-96"
            />
          ) : (
            <div className="flex h-72 items-center justify-center text-zinc-400">No photo</div>
          )}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <h1 className="text-2xl font-semibold text-zinc-900">
                {listing.name ?? "Unnamed stay"}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {[listing.neighborhood, listing.city, listing.room_type]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-600">
                {listing.review_scores_rating != null && (
                  <span className="rounded bg-zinc-100 px-2 py-0.5">
                    ★ {listing.review_scores_rating.toFixed(1)} · {listing.number_of_reviews}{" "}
                    reviews
                  </span>
                )}
                {listing.accommodates != null && <span>{listing.accommodates} guests</span>}
                {listing.bedrooms != null && <span>{listing.bedrooms} bedrooms</span>}
                {listing.beds != null && <span>{listing.beds} beds</span>}
                {listing.bathrooms != null && <span>{listing.bathrooms} baths</span>}
              </div>
              {listing.host_name && (
                <p className="mt-2 text-sm text-zinc-500">Hosted by {listing.host_name}</p>
              )}
            </section>

            {listing.description && (
              <section>
                <h2 className="text-lg font-medium text-zinc-900">About this place</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600">
                  {listing.description}
                </p>
              </section>
            )}

            <section>
              <h2 className="text-lg font-medium text-zinc-900">Guest ratings</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {aspectEntries.map(([label, score]) =>
                  score != null ? (
                    <div key={label} className="rounded-lg border border-zinc-200 bg-white p-3">
                      <p className="text-xs text-zinc-500">{label}</p>
                      <p className="text-lg font-semibold text-zinc-900">{score.toFixed(1)}</p>
                    </div>
                  ) : null,
                )}
              </div>
            </section>

            {listing.amenities.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-zinc-900">Amenities</h2>
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {listing.amenities.map((a) => (
                    <li key={a} className="rounded-md bg-white px-3 py-2 text-sm text-zinc-700">
                      {a.replace(/_/g, " ")}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-lg font-medium text-zinc-900">Location</h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
                <PropertyMap
                  latitude={listing.latitude}
                  longitude={listing.longitude}
                  name={listing.name}
                />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium text-zinc-900">AI review summary</h2>
              <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-zinc-700">
                {listing.ai_summary}
              </p>
            </section>

            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-lg font-medium text-zinc-900">Guest reviews</h2>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={langFilter}
                    onChange={(e) => setLangFilter(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  >
                    <option value="">All languages</option>
                    {languages.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <select
                    value={topicFilter}
                    onChange={(e) => setTopicFilter(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  >
                    <option value="">All topics</option>
                    {topics.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {filteredReviews.length === 0 ? (
                  <p className="text-sm text-zinc-500">No reviews match filters.</p>
                ) : (
                  filteredReviews.map((r) => (
                    <div
                      key={r.id}
                      id={`review-${r.id}`}
                      ref={(el) => {
                        reviewRefs.current[r.id] = el;
                      }}
                      className="scroll-mt-24 rounded-lg border border-zinc-200 bg-white p-4 transition-shadow"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-800">
                          {r.reviewer_name ?? "Guest"}
                        </span>
                        {r.date && <span>{formatDate(r.date)}</span>}
                      </div>
                      {r.topics.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.topics.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-sm leading-relaxed text-zinc-700">{r.comments}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xl font-semibold text-zinc-900">
                {formatPrice(listing.price)}
                <span className="text-sm font-normal text-zinc-500"> / night</span>
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-500">
                  Check-in
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  Check-out
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>

              {nights > 0 && (
                <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
                  <div className="flex justify-between">
                    <span>
                      {formatPrice(listing.price)} × {nights} nights
                    </span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxes (mock 12%)</span>
                    <span>{formatPrice(tax)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-zinc-900">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={nights <= 0}
                onClick={handleReserve}
                className="mt-4 w-full rounded-lg bg-rose-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Reserve
              </button>
              <p className="mt-2 text-center text-[10px] text-zinc-400">
                Mock booking — no payment collected
              </p>
            </div>

            {listing.calendar.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <h3 className="text-sm font-medium text-zinc-900">Availability (next 90 days)</h3>
                <div className="mt-2 flex flex-wrap gap-1">
                  {listing.calendar.slice(0, 42).map((d) => (
                    <span
                      key={d.date}
                      title={d.date}
                      className={`h-2.5 w-2.5 rounded-sm ${
                        d.available ? "bg-emerald-400" : "bg-zinc-200"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-zinc-400">
                  Green = available · gray = booked
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
