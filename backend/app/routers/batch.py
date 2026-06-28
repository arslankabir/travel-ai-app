import json

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents.factory import ModelFactory
from app.db.connection import get_db
from app.routers.listings import SELECT_COLS, _row_to_card
from app.schemas.batch import CompareListingItem, CompareRequest, CompareResponse
from app.schemas.listings import ListingCard

router = APIRouter(prefix="/batch", tags=["batch"])

COMPARE_SYSTEM = """You compare short-term rental listings for a traveler.
Be concise (4-6 sentences). Cover price/value, guest ratings, amenities, and a clear recommendation.
Name the best overall pick and note trade-offs."""


def _fetch_cards(db: Session, listing_ids: list[int]) -> list[ListingCard]:
    rows = db.execute(
        text(
            f"""
            SELECT {SELECT_COLS}
            FROM listings l
            WHERE l.id = ANY(:ids)
            """
        ),
        {"ids": listing_ids},
    ).fetchall()
    by_id = {int(r.id): _row_to_card(r) for r in rows}
    ordered = [by_id[i] for i in listing_ids if i in by_id]
    if len(ordered) < 2:
        raise HTTPException(404, "Need at least 2 valid listing IDs")
    return ordered


def _review_snippets(db: Session, listing_ids: list[int], limit_per: int = 2) -> str:
    rows = db.execute(
        text(
            """
            SELECT listing_id, comments FROM reviews
            WHERE listing_id = ANY(:ids) AND comments IS NOT NULL
            ORDER BY listing_id, date DESC NULLS LAST
            """
        ),
        {"ids": listing_ids},
    ).fetchall()
    counts: dict[int, int] = {}
    lines: list[str] = []
    for r in rows:
        lid = int(r.listing_id)
        if counts.get(lid, 0) >= limit_per:
            continue
        counts[lid] = counts.get(lid, 0) + 1
        lines.append(f"[listing {lid}] {(r.comments or '')[:200]}")
    return "\n".join(lines)


async def _build_verdict(cards: list[ListingCard], review_text: str) -> str:
    listing_lines = []
    for c in cards:
        listing_lines.append(
            f"- ID {c.id} | {c.name or 'Stay'} | {c.city} | €{c.price}/night | "
            f"rating {c.review_scores_rating} ({c.number_of_reviews} reviews) | "
            f"amenities: {', '.join(c.amenities[:8])}"
        )
    prompt = [
        SystemMessage(content=COMPARE_SYSTEM),
        HumanMessage(
            content="Listings:\n"
            + "\n".join(listing_lines)
            + "\n\nSample reviews:\n"
            + (review_text or "No reviews available.")
        ),
    ]
    llm = ModelFactory.get_llm("review")
    try:
        result = await llm.ainvoke(prompt)
        content = result.content if isinstance(result.content, str) else str(result.content)
        return content.strip()
    except Exception:
        best = max(cards, key=lambda c: (c.review_scores_rating or 0, c.number_of_reviews))
        return (
            f"Based on ratings and price, **{best.name or 'the top stay'}** "
            f"(€{best.price}/night, ★{best.review_scores_rating}) looks strongest. "
            f"Compare amenities above for your priorities."
        )


@router.post("/compare", response_model=CompareResponse)
async def compare_listings(
    req: CompareRequest,
    db: Session = Depends(get_db),
) -> CompareResponse:
    try:
        id_list = [int(x) for x in req.listing_ids]
    except ValueError as exc:
        raise HTTPException(400, "listing_ids must be numeric strings") from exc
    cards = _fetch_cards(db, id_list)
    review_text = _review_snippets(db, id_list)
    verdict = await _build_verdict(cards, review_text)

    items = [
        CompareListingItem(
            id=c.id,
            name=c.name,
            city=c.city,
            neighborhood=c.neighborhood,
            price=c.price,
            review_scores_rating=c.review_scores_rating,
            number_of_reviews=c.number_of_reviews,
            accommodates=c.accommodates,
            bedrooms=c.bedrooms,
            amenities=c.amenities,
        )
        for c in cards
    ]
    return CompareResponse(listings=items, verdict=verdict)
