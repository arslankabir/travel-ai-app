from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ListingCard(BaseModel):
    id: int
    city: str
    name: str | None
    neighborhood: str | None
    property_type: str | None
    room_type: str | None
    price: float
    review_scores_rating: float | None
    number_of_reviews: int
    picture_url: str | None
    latitude: float
    longitude: float
    accommodates: int | None
    bedrooms: int | None
    amenities: list[str] = Field(default_factory=list)


class ListingsResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[ListingCard]


SortOption = Literal["price_asc", "price_desc", "rating_desc", "reviews_desc"]


class ListingSearchParams(BaseModel):
    city: str | None = None
    min_price: float | None = Field(None, ge=0)
    max_price: float | None = Field(None, ge=0)
    min_rating: float | None = Field(None, ge=0, le=100)
    accommodates: int | None = Field(None, ge=1)
    bedrooms: int | None = Field(None, ge=0)
    amenity: str | None = None
    check_in: date | None = None
    check_out: date | None = None
    bbox: str | None = None  # min_lng,min_lat,max_lng,max_lat
    sort: SortOption = "rating_desc"
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)
