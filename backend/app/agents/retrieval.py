import json
import re
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents.factory import ModelFactory
from app.agents.state import GraphState, ListingHit, ParsedFilters
from app.cache import cache, hash_payload
from app.db.connection import SessionLocal

SELECT_COLS = """
    l.id, l.name, l.city, l.price, l.review_scores_rating, l.number_of_reviews,
    l.price_percentile, l.amenities
"""

RELAX_STEPS: list[tuple[str, list[str]]] = [
    ("dates", ["check_in", "check_out"]),
    ("amenity", ["amenity"]),
    ("bedrooms", ["bedrooms"]),
    ("min_price", ["min_price"]),
    ("min_rating", ["min_rating"]),
    ("accommodates", ["accommodates"]),
]


def _build_where(filters: ParsedFilters) -> tuple[str, dict]:
    where = ["l.embedding IS NOT NULL"]
    params: dict = {}

    if filters.get("city"):
        where.append("l.city = :city")
        params["city"] = filters["city"]
    if filters.get("min_price") is not None:
        where.append("l.price >= :min_price")
        params["min_price"] = filters["min_price"]
    if filters.get("max_price") is not None:
        where.append("l.price <= :max_price")
        params["max_price"] = filters["max_price"]
    if filters.get("min_rating") is not None:
        where.append("l.review_scores_rating >= :min_rating")
        params["min_rating"] = filters["min_rating"]
    if filters.get("accommodates") is not None:
        where.append("l.accommodates >= :accommodates")
        params["accommodates"] = filters["accommodates"]
    if filters.get("bedrooms") is not None:
        where.append("l.bedrooms >= :bedrooms")
        params["bedrooms"] = filters["bedrooms"]
    if filters.get("amenity"):
        where.append("l.amenities @> CAST(:amenity_json AS jsonb)")
        params["amenity_json"] = json.dumps([filters["amenity"]])

    check_in = filters.get("check_in")
    check_out = filters.get("check_out")
    if check_in and check_out:
        where.append(
            """
            NOT EXISTS (
                SELECT 1 FROM calendar c
                WHERE c.listing_id = l.id
                  AND c.date >= :check_in AND c.date < :check_out
                  AND NOT c.available
            )
            """
        )
        params["check_in"] = date.fromisoformat(check_in)
        params["check_out"] = date.fromisoformat(check_out)

    return " AND ".join(where), params


def _rationale(row, semantic_score: float | None) -> str:
    parts: list[str] = []
    if row.price_percentile is not None:
        pct = float(row.price_percentile)
        if pct < 0.33:
            parts.append("good value for the area")
        elif pct > 0.66:
            parts.append("premium for the neighborhood")
    if row.review_scores_rating is not None and float(row.review_scores_rating) >= 4.5:
        parts.append("high guest rating")
    if semantic_score is not None:
        parts.append(f"semantic match {semantic_score:.2f}")
    return "; ".join(parts) if parts else "matches your filters"


def _rows_to_listings(rows) -> list[ListingHit]:
    listings: list[ListingHit] = []
    for row in rows:
        semantic = float(row.semantic_score) if row.semantic_score is not None else None
        listings.append(
            ListingHit(
                id=int(row.id),
                name=row.name,
                city=row.city,
                price=float(row.price),
                rating=float(row.review_scores_rating) if row.review_scores_rating is not None else None,
                reviews=int(row.number_of_reviews or 0),
                rationale=_rationale(row, semantic),
            )
        )
    return listings


def _run_query(
    db: Session,
    filters: ParsedFilters,
    query_text: str,
    *,
    limit: int = 8,
) -> list:
    where_sql, params = _build_where(filters)
    use_vector = bool(query_text.strip())

    if use_vector:
        embeddings = ModelFactory.get_embeddings()
        vector = embeddings.embed_query(query_text)
        vector_literal = "[" + ",".join(str(v) for v in vector) + "]"
        params_with_vec = {**params, "query_vec": vector_literal, "limit": limit}
        return db.execute(
            text(
                f"""
                SELECT {SELECT_COLS},
                       1 - (l.embedding <=> CAST(:query_vec AS halfvec)) AS semantic_score
                FROM listings l
                WHERE {where_sql}
                ORDER BY l.embedding <=> CAST(:query_vec AS halfvec)
                LIMIT :limit
                """
            ),
            params_with_vec,
        ).fetchall()

    params_with_limit = {**params, "limit": limit}
    return db.execute(
        text(
            f"""
            SELECT {SELECT_COLS}, NULL::float AS semantic_score
            FROM listings l
            WHERE {where_sql}
            ORDER BY l.review_scores_rating DESC NULLS LAST, l.number_of_reviews DESC
            LIMIT :limit
            """
        ),
        params_with_limit,
    ).fetchall()


def _search_with_fallback(filters: ParsedFilters, query_text: str) -> tuple[list[ListingHit], str | None]:
    db = SessionLocal()
    relaxed: list[str] = []
    try:
        working = dict(filters)
        rows = _run_query(db, working, query_text)
        if rows:
            return _rows_to_listings(rows), None

        for label, keys in RELAX_STEPS:
            changed = False
            for key in keys:
                if working.get(key) not in (None, ""):
                    working[key] = None
                    changed = True
            if not changed:
                continue
            relaxed.append(label)
            rows = _run_query(db, working, query_text)
            if rows:
                note = f"(Relaxed filters: dropped {', '.join(relaxed)} to find matches.)"
                return _rows_to_listings(rows), note

        return [], None
    finally:
        db.close()


def _format_summary(listings: list[ListingHit], note: str | None) -> str:
    if not listings:
        return (
            "Found 0 matching stays. Try widening your budget, dropping amenity or date "
            "constraints, or searching in the NL bar on the main page."
        )
    lines = [
        f"- {h['name'] or 'Stay'} ({h['city']}): €{h['price']:.0f}/night, "
        f"rating {h['rating'] or 'N/A'}, {h['reviews']} reviews — {h['rationale']}"
        for h in listings
    ]
    header = f"Found {len(listings)} matching stays:"
    if note:
        header += f"\n{note}"
    return header + "\n" + "\n".join(lines)


async def retrieval_agent(state: GraphState) -> dict:
    filters = dict(state.get("parsed_filters") or {})
    query_text = filters.get("query_text") or state.get("user_input", "")

    cache_key = f"retrieval:{hash_payload({'filters': filters, 'q': query_text})}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    listings, note = _search_with_fallback(filters, query_text)
    summary = _format_summary(listings, note)

    result = {
        "listings": listings,
        "response_text": summary,
    }
    cache.set(cache_key, result, 300)
    return result
