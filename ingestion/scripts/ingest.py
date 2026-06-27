#!/usr/bin/env python3
"""
Inside Airbnb ingestion pipeline — Category A (deterministic) + Category B (embeddings).

Usage:
  python scripts/ingest.py                                    # all cities
  python scripts/ingest.py --city lisbon                        # single city
  python scripts/ingest.py --city lisbon --reviews-only       # skip listings (already in DB)
  python scripts/ingest.py --limit 100 --skip-embeddings      # smoke test

Cities: lisbon, amsterdam, barcelona, bergamo, madrid
Reviews: capped at REVIEWS_PER_LISTING (default 5) most recent per listing
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from openai import OpenAI
from sqlalchemy import create_engine, text
from tqdm import tqdm

# Load .env from project root
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

RAW_DATA = Path(__file__).resolve().parents[1] / "raw_data"
CITIES = ["lisbon", "amsterdam", "barcelona", "bergamo", "madrid"]


def resolve_city_dir(city: str) -> Path:
    """Resolve raw_data folder for a city (case-insensitive)."""
    direct = RAW_DATA / city.lower()
    if direct.is_dir():
        return direct
    for entry in RAW_DATA.iterdir():
        if entry.is_dir() and entry.name.lower() == city.lower():
            return entry
    raise FileNotFoundError(
        f"No raw_data folder for '{city}'. Expected one of: {', '.join(CITIES)}"
    )

AMENITY_MAP = {
    "wifi": ["wifi", "wireless", "wi-fi", "internet"],
    "kitchen": ["kitchen"],
    "pool": ["pool"],
    "parking": ["parking", "free parking"],
    "ac": ["air conditioning", "a/c", "ac"],
    "washer": ["washer", "washing machine"],
    "dryer": ["dryer"],
    "tv": ["tv", "television"],
    "heating": ["heating"],
    "elevator": ["elevator", "lift"],
    "balcony": ["balcony", "patio", "terrace"],
    "hot_tub": ["hot tub", "jacuzzi"],
}

TOPIC_KEYWORDS = {
    "cleanliness": ["clean", "dirty", "spotless", "tidy", "mess"],
    "location": ["location", "located", "neighborhood", "walk", "metro", "central"],
    "noise": ["noise", "noisy", "quiet", "loud", "street"],
    "value": ["value", "price", "worth", "expensive", "cheap", "affordable"],
    "staff": ["host", "responsive", "communication", "helpful", "rude"],
}


def parse_price(value) -> float | None:
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None
    cleaned = re.sub(r"[^\d.]", "", str(value))
    try:
        p = float(cleaned)
        return p if p > 0 else None
    except ValueError:
        return None


def normalize_amenities(raw: str) -> list[str]:
    if not isinstance(raw, str) or not raw.strip():
        return []
    tokens = [t.strip().lower() for t in raw.strip("{}").replace('"', "").split(",") if t.strip()]
    normalized: set[str] = set()
    for token in tokens:
        for canonical, variants in AMENITY_MAP.items():
            if any(v in token for v in variants):
                normalized.add(canonical)
    return sorted(normalized)


def tag_topics(text: str) -> list[str]:
    if not isinstance(text, str):
        return []
    lower = text.lower()
    return sorted([topic for topic, kws in TOPIC_KEYWORDS.items() if any(k in lower for k in kws)])


def detect_language(text: str) -> str | None:
    if not isinstance(text, str) or len(text.strip()) < 20:
        return None
    try:
        from langdetect import detect

        return detect(text)
    except Exception:
        return None


def load_gz_csv(path: Path, usecols: list[str] | None = None, nrows: int | None = None) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Missing data file: {path}")
    return pd.read_csv(path, compression="gzip", usecols=usecols, low_memory=False, nrows=nrows)


def process_listings(df: pd.DataFrame, city: str) -> pd.DataFrame:
    df = df.copy()
    df["city"] = city
    df["price"] = df["price"].apply(parse_price)
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df = df.dropna(subset=["id", "latitude", "longitude", "price"])
    df["id"] = df["id"].astype(np.int64)

    nb_col = "neighbourhood" if "neighbourhood" in df.columns else "neighborhood"
    df["neighborhood"] = df.get(nb_col, pd.Series(dtype=str)).fillna("Unknown")
    df["amenities"] = df.get("amenities", pd.Series(dtype=str)).apply(normalize_amenities)

    df["price_percentile"] = df.groupby("neighborhood")["price"].rank(pct=True)

    score_cols = [
        "review_scores_rating",
        "review_scores_cleanliness",
        "review_scores_location",
        "review_scores_value",
        "review_scores_communication",
        "review_scores_checkin",
    ]
    for col in score_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    keep = [
        "id",
        "city",
        "name",
        "description",
        "neighborhood",
        "property_type",
        "room_type",
        "accommodates",
        "bedrooms",
        "beds",
        "bathrooms",
        "price",
        "price_percentile",
        "amenities",
        "picture_url",
        "latitude",
        "longitude",
        "review_scores_rating",
        "review_scores_cleanliness",
        "review_scores_location",
        "review_scores_value",
        "review_scores_communication",
        "review_scores_checkin",
        "number_of_reviews",
        "host_id",
        "host_name",
    ]
    return df[[c for c in keep if c in df.columns]]


def process_reviews(df: pd.DataFrame, enrich: bool = True) -> pd.DataFrame:
    df = df.copy()
    df["id"] = df["id"].astype(np.int64)
    df["listing_id"] = df["listing_id"].astype(np.int64)
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    if enrich:
        df["language"] = [detect_language(c) for c in tqdm(df["comments"], desc="  Language detect")]
        df["topics"] = df["comments"].apply(tag_topics)
    else:
        df["language"] = None
        df["topics"] = df["comments"].apply(lambda _: [])
    return df[["id", "listing_id", "date", "reviewer_id", "reviewer_name", "comments", "language", "topics"]]


def select_review_ids(path: Path, valid_listing_ids: set[int], per_listing_cap: int) -> set[int]:
    """Pass 1: scan review metadata and keep IDs of N most recent reviews per listing."""
    meta_parts: list[pd.DataFrame] = []
    for chunk in tqdm(
        pd.read_csv(path, compression="gzip", usecols=["id", "listing_id", "date"], chunksize=250_000, low_memory=False),
        desc="  Scanning reviews (pass 1)",
        unit="chunk",
    ):
        chunk["listing_id"] = chunk["listing_id"].astype(np.int64)
        chunk = chunk[chunk["listing_id"].isin(valid_listing_ids)]
        if not chunk.empty:
            meta_parts.append(chunk)

    if not meta_parts:
        return set()

    meta = pd.concat(meta_parts, ignore_index=True)
    meta["date"] = pd.to_datetime(meta["date"], errors="coerce")
    keep = (
        meta.sort_values("date", ascending=False, na_position="last")
        .groupby("listing_id", sort=False)
        .head(per_listing_cap)
    )
    return set(keep["id"].astype(np.int64).tolist())


def load_reviews_sliced(
    path: Path,
    valid_listing_ids: set[int],
    per_listing_cap: int,
    enrich: bool = True,
) -> pd.DataFrame:
    """Load up to N most recent reviews per listing (two-pass, chunked)."""
    keep_ids = select_review_ids(path, valid_listing_ids, per_listing_cap)
    if not keep_ids:
        return pd.DataFrame(columns=["id", "listing_id", "date", "reviewer_id", "reviewer_name", "comments"])

    print(f"  Reviews selected (≤{per_listing_cap} per listing): {len(keep_ids):,}")
    parts: list[pd.DataFrame] = []
    for chunk in tqdm(
        pd.read_csv(path, compression="gzip", chunksize=250_000, low_memory=False),
        desc="  Loading reviews (pass 2)",
        unit="chunk",
    ):
        chunk["id"] = chunk["id"].astype(np.int64)
        chunk = chunk[chunk["id"].isin(keep_ids)]
        if not chunk.empty:
            parts.append(chunk)

    if not parts:
        return pd.DataFrame(columns=["id", "listing_id", "date", "reviewer_id", "reviewer_name", "comments"])

    return process_reviews(pd.concat(parts, ignore_index=True), enrich=enrich)


def process_calendar(path: Path, valid_listing_ids: set[int], window_days: int) -> pd.DataFrame:
    start = date.today()
    end = start + timedelta(days=window_days)
    chunks = []
    for chunk in pd.read_csv(path, compression="gzip", chunksize=500_000, low_memory=False):
        chunk["listing_id"] = chunk["listing_id"].astype(np.int64)
        chunk = chunk[chunk["listing_id"].isin(valid_listing_ids)]
        chunk["date"] = pd.to_datetime(chunk["date"], errors="coerce").dt.date
        chunk = chunk[(chunk["date"] >= start) & (chunk["date"] <= end)]
        chunk["available"] = chunk["available"].astype(str).str.lower().eq("t")
        if "price" in chunk.columns:
            chunk["price"] = chunk["price"].apply(parse_price)
        else:
            chunk["price"] = None
        chunks.append(chunk[["listing_id", "date", "available", "price"]])
    if not chunks:
        return pd.DataFrame(columns=["listing_id", "date", "available", "price"])
    return pd.concat(chunks, ignore_index=True)


def embed_descriptions(client: OpenAI, descriptions: list[str], batch_size: int, dimensions: int) -> list[list[float]]:
    embeddings: list[list[float]] = []
    texts = [d if isinstance(d, str) and d.strip() else "No description" for d in descriptions]
    for i in tqdm(range(0, len(texts), batch_size), desc="Embedding listings"):
        batch = texts[i : i + batch_size]
        resp = client.embeddings.create(model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"), input=batch, dimensions=dimensions)
        embeddings.extend([item.embedding for item in resp.data])
    return embeddings


def to_pgvector_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


def null_if_nan(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    return value


LISTING_INSERT = text("""
    INSERT INTO listings (
        id, city, name, description, neighborhood, property_type, room_type,
        accommodates, bedrooms, beds, bathrooms, price, price_percentile,
        amenities, picture_url, latitude, longitude, geometry,
        review_scores_rating, review_scores_cleanliness, review_scores_location,
        review_scores_value, review_scores_communication, review_scores_checkin,
        number_of_reviews, host_id, host_name, embedding
    ) VALUES (
        :id, :city, :name, :description, :neighborhood, :property_type, :room_type,
        :accommodates, :bedrooms, :beds, :bathrooms, :price, :price_percentile,
        CAST(:amenities AS jsonb), :picture_url, :latitude, :longitude,
        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
        :review_scores_rating, :review_scores_cleanliness, :review_scores_location,
        :review_scores_value, :review_scores_communication, :review_scores_checkin,
        :number_of_reviews, :host_id, :host_name,
        CAST(:embedding AS halfvec)
    )
    ON CONFLICT (id) DO UPDATE SET
        city = EXCLUDED.city,
        price = EXCLUDED.price,
        embedding = EXCLUDED.embedding
""")


def insert_listings(engine, df: pd.DataFrame) -> None:
    has_embedding = "embedding" in df.columns
    print(f"  Inserting {len(df):,} listings...")
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM listings WHERE city = :city"), {"city": df["city"].iloc[0]})
        batch = []
        for _, r in df.iterrows():
            batch.append(
                {
                    "id": int(r["id"]),
                    "city": r["city"],
                    "name": null_if_nan(r.get("name")),
                    "description": null_if_nan(r.get("description")),
                    "neighborhood": null_if_nan(r.get("neighborhood")),
                    "property_type": null_if_nan(r.get("property_type")),
                    "room_type": null_if_nan(r.get("room_type")),
                    "accommodates": int(r["accommodates"]) if pd.notna(r.get("accommodates")) else None,
                    "bedrooms": int(r["bedrooms"]) if pd.notna(r.get("bedrooms")) else None,
                    "beds": int(r["beds"]) if pd.notna(r.get("beds")) else None,
                    "bathrooms": float(r["bathrooms"]) if pd.notna(r.get("bathrooms")) else None,
                    "price": float(r["price"]),
                    "price_percentile": float(r["price_percentile"]) if pd.notna(r.get("price_percentile")) else None,
                    "amenities": json.dumps(r.get("amenities") or []),
                    "picture_url": null_if_nan(r.get("picture_url")),
                    "latitude": float(r["latitude"]),
                    "longitude": float(r["longitude"]),
                    "review_scores_rating": float(r["review_scores_rating"]) if pd.notna(r.get("review_scores_rating")) else None,
                    "review_scores_cleanliness": float(r["review_scores_cleanliness"]) if pd.notna(r.get("review_scores_cleanliness")) else None,
                    "review_scores_location": float(r["review_scores_location"]) if pd.notna(r.get("review_scores_location")) else None,
                    "review_scores_value": float(r["review_scores_value"]) if pd.notna(r.get("review_scores_value")) else None,
                    "review_scores_communication": float(r["review_scores_communication"]) if pd.notna(r.get("review_scores_communication")) else None,
                    "review_scores_checkin": float(r["review_scores_checkin"]) if pd.notna(r.get("review_scores_checkin")) else None,
                    "number_of_reviews": int(r["number_of_reviews"]) if pd.notna(r.get("number_of_reviews")) else 0,
                    "host_id": int(r["host_id"]) if pd.notna(r.get("host_id")) else None,
                    "host_name": null_if_nan(r.get("host_name")),
                    "embedding": to_pgvector_literal(r["embedding"]) if has_embedding and r.get("embedding") is not None else None,
                }
            )
            if len(batch) >= 500:
                conn.execute(LISTING_INSERT, batch)
                batch = []
        if batch:
            conn.execute(LISTING_INSERT, batch)


REVIEW_INSERT = text("""
    INSERT INTO reviews (id, listing_id, date, reviewer_id, reviewer_name, comments, language, topics)
    VALUES (:id, :listing_id, :date, :reviewer_id, :reviewer_name, :comments, :language, CAST(:topics AS jsonb))
    ON CONFLICT (id) DO NOTHING
""")


def insert_reviews(engine, df: pd.DataFrame, city_listing_ids: set[int]) -> None:
    if df.empty:
        return
    print(f"  Inserting {len(df):,} reviews...")
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM reviews WHERE listing_id = ANY(:ids)"),
            {"ids": list(city_listing_ids)},
        )
        batch = []
        for _, r in df.iterrows():
            batch.append(
                {
                    "id": int(r["id"]),
                    "listing_id": int(r["listing_id"]),
                    "date": r["date"],
                    "reviewer_id": int(r["reviewer_id"]) if pd.notna(r.get("reviewer_id")) else None,
                    "reviewer_name": null_if_nan(r.get("reviewer_name")),
                    "comments": null_if_nan(r.get("comments")),
                    "language": null_if_nan(r.get("language")),
                    "topics": json.dumps(r.get("topics") or []),
                }
            )
            if len(batch) >= 1000:
                conn.execute(REVIEW_INSERT, batch)
                batch = []
        if batch:
            conn.execute(REVIEW_INSERT, batch)


CALENDAR_INSERT = text("""
    INSERT INTO calendar (listing_id, date, available, price)
    VALUES (:listing_id, :date, :available, :price)
    ON CONFLICT (listing_id, date) DO UPDATE SET available = EXCLUDED.available, price = EXCLUDED.price
""")


def insert_calendar(engine, df: pd.DataFrame, city_listing_ids: set[int]) -> None:
    if df.empty:
        return
    print(f"  Inserting {len(df):,} calendar rows...")
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM calendar WHERE listing_id = ANY(:ids)"),
            {"ids": list(city_listing_ids)},
        )
        batch = []
        for _, r in df.iterrows():
            batch.append(
                {
                    "listing_id": int(r["listing_id"]),
                    "date": r["date"],
                    "available": bool(r["available"]),
                    "price": float(r["price"]) if pd.notna(r.get("price")) else None,
                }
            )
            if len(batch) >= 2000:
                conn.execute(CALENDAR_INSERT, batch)
                batch = []
        if batch:
            conn.execute(CALENDAR_INSERT, batch)


def listing_ids_for_city(engine, city: str) -> set[int]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id FROM listings WHERE city = :city"), {"city": city}).fetchall()
    return {int(r[0]) for r in rows}


def ingest_city(city: str, engine, client: OpenAI | None, args: argparse.Namespace) -> None:
    city_dir = resolve_city_dir(city)
    city = city_dir.name.lower()
    listings_path = city_dir / "listings.csv.gz"
    reviews_path = city_dir / "reviews.csv.gz"
    calendar_path = city_dir / "calendar.csv.gz"

    per_listing_cap = args.reviews_per_listing
    enrich_reviews = not args.skip_review_enrichment

    print(f"\n=== Ingesting {city} ===")

    if args.reviews_only:
        listing_ids = listing_ids_for_city(engine, city)
        if not listing_ids:
            print(f"  ERROR: No listings in DB for {city}. Run full ingest first (without --reviews-only).", file=sys.stderr)
            sys.exit(1)
        print(f"  Reviews-only mode: {len(listing_ids):,} listings from DB")
    else:
        listings_raw = load_gz_csv(listings_path, nrows=args.limit)
        listings = process_listings(listings_raw, city)
        listing_ids = set(listings["id"].tolist())
        print(f"  Listings after validation: {len(listings):,}")

        if not args.skip_embeddings and client:
            embeddings = embed_descriptions(
                client,
                listings["description"].fillna("").tolist(),
                batch_size=int(os.getenv("EMBED_BATCH_SIZE", "100")),
                dimensions=int(os.getenv("VECTOR_DIMENSION", "512")),
            )
            listings["embedding"] = embeddings
        elif not args.skip_embeddings:
            print("  WARNING: No OpenAI client — skipping embeddings")
        else:
            print("  Skipping embeddings (--skip-embeddings)")

        insert_listings(engine, listings)

    print(f"  Review cap: {per_listing_cap} most recent per listing")
    reviews = load_reviews_sliced(reviews_path, listing_ids, per_listing_cap, enrich=enrich_reviews)
    print(f"  Reviews to ingest: {len(reviews):,}")
    insert_reviews(engine, reviews, listing_ids)

    window = int(os.getenv("CALENDAR_WINDOW_DAYS", "90"))
    print(f"  Processing calendar ({window}-day window)...")
    calendar = process_calendar(calendar_path, listing_ids, window)
    print(f"  Calendar rows: {len(calendar):,}")
    insert_calendar(engine, calendar, listing_ids)


def print_stats(engine) -> None:
    with engine.connect() as conn:
        listings = conn.execute(text("SELECT COUNT(*) FROM listings")).scalar()
        reviews = conn.execute(text("SELECT COUNT(*) FROM reviews")).scalar()
        calendar = conn.execute(text("SELECT COUNT(*) FROM calendar")).scalar()
        cities = conn.execute(text("SELECT city, COUNT(*) FROM listings GROUP BY city ORDER BY city")).fetchall()
        embedded = conn.execute(text("SELECT COUNT(*) FROM listings WHERE embedding IS NOT NULL")).scalar()
    print("\n=== Database stats ===")
    print(f"  Listings:  {listings:,} ({embedded:,} with embeddings)")
    print(f"  Reviews:   {reviews:,}")
    print(f"  Calendar:  {calendar:,}")
    for city, count in cities:
        print(f"    {city}: {count:,}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inside Airbnb ingestion pipeline")
    parser.add_argument("--city", choices=CITIES, help="Ingest a single city only")
    parser.add_argument("--limit", type=int, help="Limit listings rows (smoke test)")
    parser.add_argument("--skip-embeddings", action="store_true", help="Skip OpenAI embedding calls")
    parser.add_argument("--reviews-only", action="store_true", help="Skip listings; use listing IDs already in DB")
    parser.add_argument(
        "--reviews-per-listing",
        type=int,
        default=int(os.getenv("REVIEWS_PER_LISTING", "5")),
        help="Max reviews per listing (most recent first; default from REVIEWS_PER_LISTING env or 5)",
    )
    parser.add_argument(
        "--skip-review-enrichment",
        action="store_true",
        help="Skip langdetect + topic tagging on reviews",
    )
    args = parser.parse_args()

    if args.reviews_only and args.limit:
        print("WARNING: --limit is ignored with --reviews-only", file=sys.stderr)

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set. Copy .env.example to .env", file=sys.stderr)
        sys.exit(1)

    engine = create_engine(db_url.replace("postgresql://", "postgresql+psycopg://"))

    client: OpenAI | None = None
    if not args.skip_embeddings:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or api_key == "your_openai_key_here":
            print("WARNING: OPENAI_API_KEY not set — use --skip-embeddings for smoke tests")
        else:
            client = OpenAI(api_key=api_key)

    cities = [args.city] if args.city else CITIES
    for city in cities:
        ingest_city(city, engine, client, args)

    print_stats(engine)
    print("\nDone.")


if __name__ == "__main__":
    main()
