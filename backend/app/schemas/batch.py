from pydantic import BaseModel, Field

from app.schemas.common import BigIntId


class CompareRequest(BaseModel):
    listing_ids: list[str] = Field(..., min_length=2, max_length=4)


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
    listings: list[CompareListingItem]
    verdict: str
