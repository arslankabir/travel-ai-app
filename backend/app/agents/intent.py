import json
import re
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agents.factory import ModelFactory
from app.agents.state import GraphState, IntentType, ParsedFilters

CITIES = ("lisbon", "amsterdam", "barcelona", "bergamo", "madrid")
AMENITIES = ("wifi", "kitchen", "pool", "parking", "ac", "washer", "dryer", "tv", "heating", "elevator", "balcony", "hot_tub")

INTENT_SYSTEM = """You parse travel search queries into structured filters.
Available cities: lisbon, amsterdam, barcelona, bergamo, madrid.
Amenities (canonical): wifi, kitchen, pool, parking, ac, washer, dryer, tv, heating, elevator, balcony, hot_tub.

Classify intent_type:
- search_only: find/filter stays
- review_compare: compare review quality or ask which has best/most consistent reviews
- itinerary_plan: multi-day trip planning with multiple stays

Return JSON only with fields:
city, check_in (YYYY-MM-DD or null), check_out, min_price, max_price, min_rating (0-100),
accommodates, bedrooms, amenity, vibe, query_text, intent_type
"""


class IntentOutput(BaseModel):
    city: str | None = None
    check_in: str | None = None
    check_out: str | None = None
    min_price: float | None = None
    max_price: float | None = None
    min_rating: float | None = None
    accommodates: int | None = None
    bedrooms: int | None = Field(None, description="Minimum bedrooms")
    amenity: str | None = None
    vibe: str | None = None
    query_text: str | None = None
    intent_type: Literal["search_only", "review_compare", "itinerary_plan"] = "search_only"


def _repair_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object in LLM response")
    return json.loads(match.group())


CHITCHAT_RE = re.compile(
    r"^(hi|hello|hey|hii+|hellop+|thanks|thank you|yo|sup|howdy)[\s!.?]*$",
    re.I,
)

HELP_PHRASES = (
    "how can you help",
    "how you can help",
    "how do you help",
    "what can you do",
    "what do you do",
    "can you help",
    "can we talk",
    "who are you",
    "what are you",
    "help me",
)

CONCIERGE_GREETING = (
    "Hello! I can help you find stays, compare guest reviews, or plan a multi-day trip. "
    "Try: \"Find a quiet 1-bed in Lisbon under €130 with good reviews.\""
)

CONCIERGE_HELP = (
    "I can search stays by city, price, and amenities; compare guest review themes with citations; "
    "and draft multi-day itineraries. Tell me a destination and what matters to you — "
    "e.g. \"quiet 1-bed in Lisbon under €130 with consistent reviews.\""
)


def _is_chitchat(user_input: str) -> bool:
    text = user_input.strip()
    lower = text.lower()
    if len(text) < 4:
        return True
    if CHITCHAT_RE.match(text):
        return True
    if any(phrase in lower for phrase in HELP_PHRASES):
        return True
    # Meta questions with no city, price, or travel keywords
    has_travel_signal = any(c in lower for c in CITIES) or bool(re.search(r"\d|€|euro|night|bed|review|trip|stay", lower))
    if not has_travel_signal and any(w in lower for w in ("help", "talk", "who", "what can", "how")):
        return True
    return False


def _chitchat_response(user_input: str) -> str:
    lower = user_input.strip().lower()
    if any(p in lower for p in ("help", "what can", "how", "who")):
        return CONCIERGE_HELP
    return CONCIERGE_GREETING


def _has_actionable_filters(filters: ParsedFilters) -> bool:
    actionable_keys = (
        "city", "check_in", "check_out", "min_price", "max_price",
        "min_rating", "accommodates", "bedrooms", "amenity",
    )
    return any(filters.get(k) not in (None, "") for k in actionable_keys)


def _heuristic_intent(user_input: str) -> IntentOutput:
    lower = user_input.lower()
    city = next((c for c in CITIES if c in lower), None)
    amenity = next((a for a in AMENITIES if a.replace("_", " ") in lower or a in lower), None)

    bedrooms = None
    bed_match = re.search(r"(\d+)\s*[- ]?\s*bed", lower)
    if bed_match:
        bedrooms = int(bed_match.group(1))

    max_price = None
    price_match = re.search(r"(?:under|below|max|€|<)\s*€?\s*(\d+)", lower)
    if price_match:
        max_price = float(price_match.group(1))

    intent_type: Literal["search_only", "review_compare", "itinerary_plan"] = "search_only"
    if any(w in lower for w in ("review", "consistent", "compare", "which one")):
        intent_type = "review_compare"
    if any(w in lower for w in ("itinerary", "plan a", "night trip", "multi-day")):
        intent_type = "itinerary_plan"

    return IntentOutput(
        city=city,
        max_price=max_price,
        bedrooms=bedrooms,
        amenity=amenity,
        vibe=user_input,
        query_text=user_input,
        intent_type=intent_type,
    )


def _to_parsed_filters(data: IntentOutput) -> ParsedFilters:
    city = data.city.lower() if data.city else None
    amenity = data.amenity.lower() if data.amenity else None
    return ParsedFilters(
        city=city,
        check_in=data.check_in,
        check_out=data.check_out,
        min_price=data.min_price,
        max_price=data.max_price,
        min_rating=data.min_rating,
        accommodates=data.accommodates,
        bedrooms=data.bedrooms,
        amenity=amenity,
        vibe=data.vibe,
        query_text=data.query_text or data.vibe,
    )


async def intent_agent(state: GraphState) -> dict:
    user_input = state["user_input"]

    if state.get("mode") == "concierge" and _is_chitchat(user_input):
        return {
            "intent_type": "chitchat",
            "parsed_filters": None,
            "response_text": _chitchat_response(user_input),
        }

    llm = ModelFactory.get_llm("intent")
    structured = llm.with_structured_output(IntentOutput)

    prompt = [
        SystemMessage(content=INTENT_SYSTEM),
        HumanMessage(content=f"Mode: {state['mode']}\nQuery: {state['user_input']}"),
    ]

    try:
        result: IntentOutput = await structured.ainvoke(prompt)
    except Exception:
        try:
            raw = await llm.ainvoke(prompt)
            content = raw.content if isinstance(raw.content, str) else str(raw.content)
            result = IntentOutput.model_validate(_repair_json(content))
        except Exception:
            result = _heuristic_intent(user_input)

    filters = _to_parsed_filters(result)
    intent_type: IntentType = result.intent_type

    if state["mode"] == "concierge" and intent_type == "search_only" and not _has_actionable_filters(filters):
        return {
            "intent_type": "chitchat",
            "parsed_filters": None,
            "response_text": _chitchat_response(user_input),
        }

    if state["mode"] == "search":
        intent_type = "search_only"
        if not _has_actionable_filters(filters):
            return {
                "intent_type": "search_only",
                "parsed_filters": filters,
                "response_text": "",
            }

    return {
        "intent_type": intent_type,
        "parsed_filters": filters,
    }
