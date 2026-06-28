export type SortOption =
  | "price_asc"
  | "price_desc"
  | "rating_desc"
  | "reviews_desc";

export interface ListingCard {
  id: string;
  city: string;
  name: string | null;
  neighborhood: string | null;
  property_type: string | null;
  room_type: string | null;
  price: number;
  review_scores_rating: number | null;
  number_of_reviews: number;
  picture_url: string | null;
  latitude: number;
  longitude: number;
  accommodates: number | null;
  bedrooms: number | null;
  amenities: string[];
}

export interface ListingsResponse {
  total: number;
  limit: number;
  offset: number;
  items: ListingCard[];
}

export interface AspectScores {
  cleanliness: number | null;
  location: number | null;
  value: number | null;
  communication: number | null;
  checkin: number | null;
}

export interface ReviewItem {
  id: string;
  date: string | null;
  reviewer_name: string | null;
  comments: string | null;
  language: string | null;
  topics: string[];
}

export interface CalendarDay {
  date: string;
  available: boolean;
  price: number | null;
}

export interface ListingDetail {
  id: string;
  city: string;
  name: string | null;
  description: string | null;
  neighborhood: string | null;
  property_type: string | null;
  room_type: string | null;
  price: number;
  review_scores_rating: number | null;
  number_of_reviews: number;
  picture_url: string | null;
  latitude: number;
  longitude: number;
  accommodates: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  amenities: string[];
  host_name: string | null;
  aspects: AspectScores;
  ai_summary: string | null;
  reviews: ReviewItem[];
  calendar: CalendarDay[];
}

export interface SearchFilters {
  city?: string;
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  accommodates?: number;
  bedrooms?: number;
  amenity?: string;
  check_in?: string;
  check_out?: string;
  bbox?: string;
  sort?: SortOption;
  limit?: number;
  offset?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function toQuery(filters: SearchFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== null) {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

export async function fetchListings(
  filters: SearchFilters,
): Promise<ListingsResponse> {
  const qs = toQuery(filters);
  const res = await fetch(`${API_BASE}/api/listings?${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Listings request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchListingDetail(id: string): Promise<ListingDetail> {
  const res = await fetch(`${API_BASE}/api/listings/${id}/detail`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Listing detail failed (${res.status})`);
  }
  return res.json();
}

export async function fetchListingsByIds(ids: string[]): Promise<ListingsResponse> {
  if (ids.length === 0) {
    return { total: 0, limit: 0, offset: 0, items: [] };
  }
  const res = await fetch(
    `${API_BASE}/api/listings/by-ids?ids=${encodeURIComponent(ids.join(","))}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Listings by IDs failed (${res.status})`);
  }
  return res.json();
}

export interface CompareListingItem {
  id: string;
  name: string | null;
  city: string;
  neighborhood: string | null;
  price: number;
  review_scores_rating: number | null;
  number_of_reviews: number;
  accommodates: number | null;
  bedrooms: number | null;
  amenities: string[];
}

export interface CompareResponse {
  listings: CompareListingItem[];
  verdict: string;
}

export async function fetchCompare(listingIds: string[]): Promise<CompareResponse> {
  const res = await fetch(`${API_BASE}/api/batch/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      listing_ids: listingIds.map((id) => id),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Compare failed (${res.status})`);
  }
  return res.json();
}

export const CITIES = [
  "lisbon",
  "amsterdam",
  "barcelona",
  "bergamo",
  "madrid",
] as const;

export const AMENITIES = [
  "wifi",
  "kitchen",
  "pool",
  "parking",
  "ac",
  "washer",
  "dryer",
  "tv",
  "heating",
  "elevator",
  "balcony",
  "hot_tub",
] as const;

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "rating_desc", label: "Top rated" },
  { value: "reviews_desc", label: "Most reviewed" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];
