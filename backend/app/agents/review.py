import json
import re

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel
from sqlalchemy import text

from app.agents.factory import ModelFactory
from app.agents.state import Citation, GraphState
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
Keep summary concise (3-5 sentences). Compare consistency and recurring themes when multiple listings."""


def _validate_citations(citations: list[ReviewCitation], valid_ids: set[int]) -> list[Citation]:
    validated: list[Citation] = []
    for c in citations:
        if c.review_id in valid_ids:
            validated.append(Citation(review_id=c.review_id, listing_id=c.listing_id, quote=c.quote))
    return validated


async def review_agent(state: GraphState) -> dict:
    listings = state.get("listings") or []
    if not listings:
        return {"review_summary": None, "citations": []}

    listing_ids = [h["id"] for h in listings[:5]]
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

    valid_ids = {int(r.id) for r in rows}
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

    try:
        result: ReviewOutput = await structured.ainvoke(prompt)
    except Exception:
        raw = await llm.ainvoke(prompt)
        content = raw.content if isinstance(raw.content, str) else str(raw.content)
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return {"review_summary": content, "citations": []}
        result = ReviewOutput.model_validate(json.loads(match.group()))

    citations = _validate_citations(result.citations, valid_ids)
    return {"review_summary": result.summary, "citations": citations}
