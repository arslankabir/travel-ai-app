from typing import Annotated, Literal, TypedDict

from langgraph.graph.message import add_messages


IntentType = Literal["search_only", "review_compare", "itinerary_plan"]
ChatMode = Literal["search", "concierge"]


class ParsedFilters(TypedDict, total=False):
    city: str | None
    check_in: str | None
    check_out: str | None
    min_price: float | None
    max_price: float | None
    min_rating: float | None
    accommodates: int | None
    bedrooms: int | None
    amenity: str | None
    vibe: str | None
    query_text: str | None


class ListingHit(TypedDict):
    id: int
    name: str | None
    city: str
    price: float
    rating: float | None
    reviews: int
    rationale: str


class Citation(TypedDict):
    review_id: int
    listing_id: int
    quote: str


class GraphState(TypedDict):
    messages: Annotated[list, add_messages]
    mode: ChatMode
    request_id: str
    user_input: str
    intent_type: IntentType | None
    parsed_filters: ParsedFilters | None
    listings: list[ListingHit]
    citations: list[Citation]
    response_text: str
    itinerary: str | None
    error: str | None
