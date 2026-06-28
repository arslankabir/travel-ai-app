import { ListingCard } from "./api";

const STORAGE_KEY = "travel_ai_wishlist";

export function getWishlist(): ListingCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ListingCard[];
  } catch {
    return [];
  }
}

export function saveWishlist(items: ListingCard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function isWishlisted(id: string): boolean {
  return getWishlist().some((item) => item.id === id);
}

export function toggleWishlist(item: ListingCard): ListingCard[] {
  const current = getWishlist();
  const exists = current.some((x) => x.id === item.id);
  const next = exists ? current.filter((x) => x.id !== item.id) : [...current, item];
  saveWishlist(next);
  return next;
}

export function removeFromWishlist(id: string): ListingCard[] {
  const next = getWishlist().filter((x) => x.id !== id);
  saveWishlist(next);
  return next;
}
