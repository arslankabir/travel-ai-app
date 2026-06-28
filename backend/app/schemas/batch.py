from pydantic import BaseModel, Field

from app.schemas.common import BigIntId


class CompareRequest(BaseModel):
    listing_ids: list[str] = Field(..., min_length=2, max_length=5)


class CompareListingItem(BaseModel):
    id: BigIntId
    name: str | None
    city: str
    neighborhood: str | None
    price: float
    review_scores_rating: float | None
    number_of_reviews: int
    accommodates: int | None
    bedrooms: int | None
    amenities: list[str] = Field(default_factory=list)


class CompareResponse(BaseModel):
    request_id: str
    listings: list[CompareListingItem]
    verdict: str
    cached: bool = False


class SummarizeRequest(BaseModel):
    listing_ids: list[str] = Field(..., min_length=1, max_length=20)


class SummarizeItem(BaseModel):
    listing_id: BigIntId
    name: str | None
    summary: str
    cached: bool = False


class SummarizeResponse(BaseModel):
    request_id: str
    items: list[SummarizeItem]
    cached_count: int = 0
