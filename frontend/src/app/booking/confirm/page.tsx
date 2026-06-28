"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function formatPrice(value: string) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function ConfirmContent() {
  const params = useSearchParams();
  const listingId = params.get("listing_id");
  const name = params.get("name") ?? "Your stay";
  const city = params.get("city");
  const checkIn = params.get("check_in");
  const checkOut = params.get("check_out");
  const nights = params.get("nights");
  const total = params.get("total");

  const valid = listingId && checkIn && checkOut && nights && total;

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">Booking confirmed</h1>
        <p className="mt-2 text-sm text-zinc-500">
          This is a mock reservation for demo purposes — no charge was made.
        </p>

        {valid ? (
          <dl className="mt-6 space-y-2 rounded-lg bg-zinc-50 p-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Property</dt>
              <dd className="font-medium text-zinc-900">{name}</dd>
            </div>
            {city && (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">City</dt>
                <dd className="capitalize text-zinc-900">{city}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Check-in</dt>
              <dd className="text-zinc-900">{checkIn}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Check-out</dt>
              <dd className="text-zinc-900">{checkOut}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Nights</dt>
              <dd className="text-zinc-900">{nights}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2">
              <dt className="font-medium text-zinc-700">Total</dt>
              <dd className="font-semibold text-zinc-900">{formatPrice(total)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-xs text-zinc-400">
              <dt>Confirmation #</dt>
              <dd>MOCK-{listingId}-{Date.now().toString(36).slice(-6).toUpperCase()}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-6 text-sm text-amber-700">
            Missing booking details. Start from a property page to reserve.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {listingId && (
            <Link
              href={`/property/${listingId}`}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
            >
              View property
            </Link>
          )}
          <Link
            href="/"
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            Back to search
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BookingConfirmPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading…</div>}>
      <ConfirmContent />
    </Suspense>
  );
}
