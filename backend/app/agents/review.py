import json
import re

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel
from sqlalchemy import text

from app.agents.factory import ModelFactory
from app.agents.state import Citation, GraphState
from app.cache import cache, hash_payload
from app.db.connection import SessionLocal


class ReviewCitation(BaseModel):
    review_id: int
    listing_id: int
    quote: str


class ReviewOutput(BaseModel):
    summary: str
    citations: list[ReviewCitation]


REVIEW_SYSTEM = """You synthesize guest review insights for travel listings.
Only cite reviews provided in the context. Each citation must use an exact review_id from context.
Include 2-5 citations when reviews are available. Each quote must be a short excerpt from that review.
Keep summary concise (3-5 sentences). Compare consistency and recurring themes when multiple listings."""

REVIEW_CACHE_TTL = 3600


def _review_lookup(rows) -> tuple[set[int], dict[int, int]]:
    valid_ids = {int(r.id) for r in rows}
    id_to_listing = {int(r.id): int(r.listing_id) for r in rows}
    return valid_ids, id_to_listing


def _validate_citations(
    citations: list[ReviewCitation],
    valid_ids: set[int],
    id_to_listing: dict[int, int],
) -> list[Citation]:
    validated: list[Citation] = []
    for c in citations:
        if c.review_id not in valid_ids:
            continue
        quote = (c.quote or "").strip()
        if not quote:
            continue
        validated.append(
            Citation(
                review_id=c.review_id,
                listing_id=id_to_listing.get(c.review_id, c.listing_id),
                quote=quote[:200],
            )
        )
    return validated


def _attach_listing_names(citations: list[Citation], listings: list) -> list[Citation]:
    names = {int(h["id"]): h.get("name") or "Stay" for h in listings}
    out: list[Citation] = []
    for c in citations:
        enriched: Citation = {
            **c,
            "listing_name": names.get(int(c["listing_id"]), "Stay"),
        }
        out.append(enriched)
    return out


def _fallback_citations(rows, listing_ids: list[int], *, max_total: int = 5) -> list[Citation]:
    """Deterministic citations when the LLM omits or hallucinates review IDs."""
    order = {int(lid): i for i, lid in enumerate(listing_ids)}
    ranked = sorted(rows, key=lambda r: order.get(int(r.listing_id), 999))

    citations: list[Citation] = []
    seen_listings: set[int] = set()
    for r in ranked:
        lid = int(r.listing_id)
        if lid in seen_listings:
            continue
        comment = (r.comments or "").strip()
        if not comment:
            continue
        seen_listings.add(lid)
        citations.append(
            Citation(review_id=int(r.id), listing_id=lid, quote=comment[:200])
        )
        if len(citations) >= max_total:
            return citations

    for r in rows:
        if len(citations) >= max_total:
            break
        comment = (r.comments or "").strip()
        if not comment:
            continue
        rid, lid = int(r.id), int(r.listing_id)
        if any(c["review_id"] == rid for c in citations):
            continue
        citations.append(Citation(review_id=rid, listing_id=lid, quote=comment[:200]))
    return citations


async def review_agent(state: GraphState) -> dict:
    listings = state.get("listings") or []
    if not listings:
        return {"review_summary": None, "citations": []}

    listing_ids = [h["id"] for h in listings[:5]]
    cache_key = f"review:{hash_payload({'ids': sorted(listing_ids), 'q': state.get('user_input', '')})}"
    cached = cache.get(cache_key)
    if cached:
        return {
            "review_summary": cached["review_summary"],
            "citations": cached["citations"],
        }

    db = SessionLocal()
    try:
        rows = db.execute(
            text(
                """
                SELECT id, listing_id, comments
                FROM reviews
                WHERE listing_id = ANY(:ids)
                ORDER BY listing_id, date DESC NULLS LAST
                LIMIT 40
                """
            ),
            {"ids": listing_ids},
        ).fetchall()
    finally:
        db.close()

    if not rows:
        return {"review_summary": "No reviews found for these listings.", "citations": []}

    valid_ids, id_to_listing = _review_lookup(rows)
    context_lines = [
        f"[review_id={r.id} listing_id={r.listing_id}] {(r.comments or '')[:400]}"
        for r in rows
    ]
    context = "\n".join(context_lines)

    llm = ModelFactory.get_llm("review")
    structured = llm.with_structured_output(ReviewOutput)

    prompt = [
        SystemMessage(content=REVIEW_SYSTEM),
        HumanMessage(
            content=f"User query: {state['user_input']}\n\nReviews:\n{context}"
        ),
    ]

    summary = ""
    try:
        result: ReviewOutput = await structured.ainvoke(prompt)
        summary = result.summary
        citations = _validate_citations(result.citations, valid_ids, id_to_listing)
    except Exception:
        raw = await llm.ainvoke(prompt)
        content = raw.content if isinstance(raw.content, str) else str(raw.content)
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                result = ReviewOutput.model_validate(json.loads(match.group()))
                summary = result.summary
                citations = _validate_citations(result.citations, valid_ids, id_to_listing)
            except Exception:
                summary = content
                citations = []
        else:
            summary = content
            citations = []

    if not citations:
        citations = _fallback_citations(rows, listing_ids)

    citations = _attach_listing_names(citations, listings)
    result = {"review_summary": summary, "citations": citations}
    cache.set(cache_key, result, REVIEW_CACHE_TTL)
    return result
