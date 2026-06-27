export type SortOption =
  | "price_asc"
  | "price_desc"
  | "rating_desc"
  | "reviews_desc";

export interface ListingCard {
  id: number;
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
