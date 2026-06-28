"use client";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

interface BookingCardProps {
  price: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  subtotal: number;
  tax: number;
  total: number;
  onCheckInChange: (v: string) => void;
  onCheckOutChange: (v: string) => void;
  onReserve: () => void;
  calendarPreview?: Array<{ date: string; available: boolean }>;
}

export default function BookingCard({
  price,
  checkIn,
  checkOut,
  nights,
  subtotal,
  tax,
  total,
  onCheckInChange,
  onCheckOutChange,
  onReserve,
  calendarPreview,
}: BookingCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl ring-1 ring-zinc-200/80">
      <div className="border-b border-zinc-100 px-5 pb-4 pt-5">
        <p className="text-2xl font-semibold text-zinc-900">
          {formatPrice(price)}
          <span className="text-base font-normal text-zinc-500"> / night</span>
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="overflow-hidden rounded-lg border border-zinc-300">
          <div className="grid grid-cols-2 divide-x divide-zinc-300">
            <label className="flex flex-col px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-800">
                Check-in
              </span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => onCheckInChange(e.target.value)}
                className="mt-0.5 border-0 bg-transparent p-0 text-sm text-zinc-700 outline-none"
              />
            </label>
            <label className="flex flex-col px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-800">
                Check-out
              </span>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => onCheckOutChange(e.target.value)}
                className="mt-0.5 border-0 bg-transparent p-0 text-sm text-zinc-700 outline-none"
              />
            </label>
          </div>
        </div>

        {nights > 0 && (
          <div className="space-y-2 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
            <div className="flex justify-between">
              <span className="underline decoration-zinc-300 underline-offset-2">
                {formatPrice(price)} × {nights} nights
              </span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Taxes & fees (mock)</span>
              <span>{formatPrice(tax)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-2 font-semibold text-zinc-900">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 px-5 pb-5">
        <button
          type="button"
          disabled={nights <= 0}
          onClick={onReserve}
          className="h-12 w-full rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 text-base font-semibold text-white transition hover:from-rose-700 hover:to-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reserve
        </button>
        <p className="text-center text-xs text-zinc-400">You won&apos;t be charged — mock booking</p>
      </div>

      {calendarPreview && calendarPreview.length > 0 && (
        <div className="border-t border-zinc-100 px-5 py-4">
          <p className="text-xs font-medium text-zinc-800">Availability · next 6 weeks</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {calendarPreview.slice(0, 42).map((d) => (
              <span
                key={d.date}
                title={d.date}
                className={`h-2 w-2 rounded-sm ${d.available ? "bg-emerald-500" : "bg-zinc-200"}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
