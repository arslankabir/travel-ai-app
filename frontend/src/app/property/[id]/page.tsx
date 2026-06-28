"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import BookingCard from "@/components/property/BookingCard";
import PropertyReviews from "@/components/property/PropertyReviews";
import RatingBreakdown from "@/components/property/RatingBreakdown";
import PropertyMap from "@/components/PropertyMap";
import { fetchListingDetail, ListingDetail } from "@/lib/api";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
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
  const [checkIn, setCheckIn] = useState(searchParams.get("check_in") ?? "");
  const [checkOut, setCheckOut] = useState(searchParams.get("check_out") ?? "");
  const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null);

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
    const match = window.location.hash.match(/^#review-(\d+)$/);
    if (!match) return;
    const reviewId = match[1];
    setHighlightReviewId(reviewId);
    const el = document.getElementById(`review-${reviewId}`);
    if (el) {
      window.setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [listing]);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const subtotal = listing && nights > 0 ? listing.price * nights : 0;
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

  const aspectEntries = useMemo(
    () =>
      listing
        ? [
            { label: "Cleanliness", score: listing.aspects.cleanliness },
            { label: "Location", score: listing.aspects.location },
            { label: "Value", score: listing.aspects.value },
            { label: "Communication", score: listing.aspects.communication },
            { label: "Check-in", score: listing.aspects.checkin },
          ]
        : [],
    [listing],
  );

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
      <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-muted-foreground">
        Loading property…
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-sm text-red-600">{error ?? "Not found"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-rose-600 hover:underline">
          ← Back to search
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:text-zinc-900"
          >
            ← Back to search
          </Link>
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Travel AI
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-6">
        {/* Title row — Airbnb puts title above gallery */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-zinc-900 md:text-[32px]">
              {listing.name ?? "Unnamed stay"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {listing.review_scores_rating != null && (
                <span className="flex items-center gap-1 font-medium text-zinc-900">
                  ★ {listing.review_scores_rating.toFixed(2)}
                </span>
              )}
              {listing.number_of_reviews > 0 && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="underline decoration-zinc-300 underline-offset-2">
                    {listing.number_of_reviews} reviews
                  </span>
                </>
              )}
              <span className="text-zinc-300">·</span>
              <span className="text-zinc-600 capitalize">
                {[listing.neighborhood, listing.city].filter(Boolean).join(", ")}
              </span>
            </div>
          </div>
          <div className="text-right text-sm text-zinc-600">
            {listing.host_name && <p>Hosted by {listing.host_name}</p>}
            {listing.room_type && <p className="text-zinc-500">{listing.room_type}</p>}
          </div>
        </div>

        {/* Hero gallery */}
        <div className="overflow-hidden rounded-xl bg-zinc-100">
          {listing.picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.picture_url}
              alt={listing.name ?? "Property"}
              className="aspect-[16/9] w-full object-cover md:aspect-[21/9] md:max-h-[480px]"
            />
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center text-zinc-400">
              No photo available
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
          <div className="min-w-0 space-y-10">
            {/* Quick facts */}
            <section className="flex flex-wrap gap-3 border-b border-zinc-200 pb-8">
              {listing.accommodates != null && (
                <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700">
                  {listing.accommodates} guests
                </span>
              )}
              {listing.bedrooms != null && (
                <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700">
                  {listing.bedrooms} bedrooms
                </span>
              )}
              {listing.beds != null && (
                <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700">
                  {listing.beds} beds
                </span>
              )}
              {listing.bathrooms != null && (
                <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700">
                  {listing.bathrooms} baths
                </span>
              )}
              {listing.property_type && (
                <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700">
                  {listing.property_type}
                </span>
              )}
            </section>

            {listing.description && (
              <section>
                <h2 className="text-[22px] font-semibold text-zinc-900">About this place</h2>
                <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-zinc-700">
                  {listing.description}
                </p>
              </section>
            )}

            <hr className="border-zinc-200" />

            <section>
              <h2 className="mb-6 text-[22px] font-semibold text-zinc-900">Reviews & ratings</h2>
              <RatingBreakdown
                overall={listing.review_scores_rating}
                reviewCount={listing.number_of_reviews}
                aspects={aspectEntries}
              />
            </section>

            {listing.ai_summary && (
              <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  AI review summary
                </h3>
                <p className="mt-3 text-base leading-relaxed text-zinc-800">{listing.ai_summary}</p>
                <p className="mt-3 text-xs text-zinc-400">
                  Synthesized from guest reviews — citations available in concierge chat
                </p>
              </section>
            )}

            <PropertyReviews reviews={listing.reviews} highlightReviewId={highlightReviewId} />

            {listing.amenities.length > 0 && (
              <section className="border-t border-zinc-200 pt-10">
                <h2 className="text-[22px] font-semibold text-zinc-900">What this place offers</h2>
                <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {listing.amenities.map((a) => (
                    <li
                      key={a}
                      className="flex items-center gap-3 text-[15px] text-zinc-700"
                    >
                      <span className="text-emerald-600">✓</span>
                      <span className="capitalize">{a.replace(/_/g, " ")}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border-t border-zinc-200 pt-10">
              <h2 className="text-[22px] font-semibold text-zinc-900">Where you&apos;ll be</h2>
              <p className="mt-1 text-sm text-zinc-500 capitalize">
                {[listing.neighborhood, listing.city].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
                <PropertyMap
                  latitude={listing.latitude}
                  longitude={listing.longitude}
                  name={listing.name}
                />
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <BookingCard
              price={listing.price}
              checkIn={checkIn}
              checkOut={checkOut}
              nights={nights}
              subtotal={subtotal}
              tax={tax}
              total={total}
              onCheckInChange={setCheckIn}
              onCheckOutChange={setCheckOut}
              onReserve={handleReserve}
              calendarPreview={listing.calendar}
            />
            {nights > 0 && (
              <p className="mt-3 text-center text-sm text-zinc-500">
                {formatPrice(listing.price)} × {nights} nights before taxes
              </p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
