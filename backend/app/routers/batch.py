import asyncio
import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents.factory import ModelFactory
from app.agents.telemetry import trace_store
from app.cache import cache, hash_payload
from app.db.connection import SessionLocal, get_db
from app.routers.listings import SELECT_COLS, _row_to_card
from app.schemas.batch import (
    CompareListingItem,
    CompareRequest,
    CompareResponse,
    SummarizeItem,
    SummarizeRequest,
    SummarizeResponse,
)
from app.schemas.listings import ListingCard

router = APIRouter(prefix="/batch", tags=["batch"])

COMPARE_TTL = 3600
SUMMARY_TTL = 86400

COMPARE_SYSTEM = """You compare short-term rental listings for a traveler.
Be concise (4-6 sentences). Cover price/value, guest ratings, amenities, and a clear recommendation.
Name the best overall pick and note trade-offs."""

SUMMARY_SYSTEM = """Summarize guest review themes for one listing in 2-3 sentences.
Mention strengths and any recurring complaints. Be factual and concise."""


def _fetch_cards(db: Session, listing_ids: list[int]) -> list[ListingCard]:
    rows = db.execute(
        text(f"SELECT {SELECT_COLS} FROM listings l WHERE l.id = ANY(:ids)"),
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
    listing_lines = [
        f"- ID {c.id} | {c.name or 'Stay'} | {c.city} | €{c.price}/night | "
        f"rating {c.review_scores_rating} ({c.number_of_reviews} reviews) | "
        f"amenities: {', '.join(c.amenities[:8])}"
        for c in cards
    ]
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


async def _summarize_one(listing_id: int) -> SummarizeItem:
    cache_key = f"summary:{listing_id}"
    cached = cache.get(cache_key)
    if cached:
        return SummarizeItem(listing_id=listing_id, name=cached.get("name"), summary=cached["summary"], cached=True)

    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT name FROM listings WHERE id = :id"),
            {"id": listing_id},
        ).one_or_none()
        if row is None:
            return SummarizeItem(
                listing_id=listing_id,
                name=None,
                summary="Listing not found.",
                cached=False,
            )
        name = row.name

        review_rows = db.execute(
            text(
                """
                SELECT comments FROM reviews
                WHERE listing_id = :id AND comments IS NOT NULL
                ORDER BY date DESC NULLS LAST LIMIT 5
                """
            ),
            {"id": listing_id},
        ).fetchall()
    finally:
        db.close()

    comments = [(r.comments or "")[:300] for r in review_rows if r.comments]
    if not comments:
        summary = "No guest reviews available for this listing yet."
    else:
        llm = ModelFactory.get_llm("review")
        prompt = [
            SystemMessage(content=SUMMARY_SYSTEM),
            HumanMessage(content=f"Listing: {name or listing_id}\n\nReviews:\n" + "\n---\n".join(comments)),
        ]
        try:
            result = await llm.ainvoke(prompt)
            summary = result.content if isinstance(result.content, str) else str(result.content)
            summary = summary.strip()
        except Exception:
            summary = "Guests mention mixed experiences; see individual reviews on the property page."

    cache.set(cache_key, {"name": name, "summary": summary}, SUMMARY_TTL)
    return SummarizeItem(listing_id=listing_id, name=name, summary=summary, cached=False)


@router.post("/compare", response_model=CompareResponse)
async def compare_listings(
    req: CompareRequest,
    db: Session = Depends(get_db),
) -> CompareResponse:
    request_id = str(uuid.uuid4())
    trace = trace_store.create(request_id)
    trace.start_step("batch_compare")
    start = time.time()

    try:
        id_list = [int(x) for x in req.listing_ids]
    except ValueError as exc:
        trace.fail_step("batch_compare")
        trace_store.save(request_id, trace)
        raise HTTPException(400, "listing_ids must be numeric strings") from exc

    cache_key = f"compare:{hash_payload(sorted(id_list))}"
    cached = cache.get(cache_key)
    if cached:
        trace.finish_step("batch_compare", results_count=len(cached.get("listings", [])))
        trace.finalize(int((time.time() - start) * 1000))
        trace_store.save(request_id, trace)
        return CompareResponse(
            request_id=request_id,
            listings=[CompareListingItem(**item) for item in cached["listings"]],
            verdict=cached["verdict"],
            cached=True,
        )

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
    payload = {"listings": [i.model_dump() for i in items], "verdict": verdict}
    cache.set(cache_key, payload, COMPARE_TTL)

    trace.finish_step("batch_compare", results_count=len(items))
    trace.finalize(int((time.time() - start) * 1000))
    trace_store.save(request_id, trace)

    return CompareResponse(request_id=request_id, listings=items, verdict=verdict, cached=False)


@router.post("/summarize", response_model=SummarizeResponse)
async def batch_summarize(req: SummarizeRequest) -> SummarizeResponse:
    request_id = str(uuid.uuid4())
    trace = trace_store.create(request_id)
    trace.start_step("batch_summarize")
    start = time.time()

    try:
        id_list = [int(x) for x in req.listing_ids]
    except ValueError as exc:
        trace.fail_step("batch_summarize")
        trace_store.save(request_id, trace)
        raise HTTPException(400, "listing_ids must be numeric strings") from exc

    items = await asyncio.gather(*[_summarize_one(lid) for lid in id_list])
    cached_count = sum(1 for i in items if i.cached)

    trace.finish_step("batch_summarize", results_count=len(items))
    trace.finalize(int((time.time() - start) * 1000))
    trace_store.save(request_id, trace)

    return SummarizeResponse(request_id=request_id, items=list(items), cached_count=cached_count)
