from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import BigIntId


class ListingCard(BaseModel):
    id: BigIntId
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


class AspectScores(BaseModel):
    cleanliness: float | None = None
    location: float | None = None
    value: float | None = None
    communication: float | None = None
    checkin: float | None = None


class ReviewItem(BaseModel):
    id: BigIntId
    date: date | None
    reviewer_name: str | None
    comments: str | None
    language: str | None
    topics: list[str] = Field(default_factory=list)


class CalendarDay(BaseModel):
    date: date
    available: bool
    price: float | None = None


class ListingDetail(BaseModel):
    id: BigIntId
    city: str
    name: str | None
    description: str | None
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
    beds: int | None
    bathrooms: float | None
    amenities: list[str] = Field(default_factory=list)
    host_name: str | None
    aspects: AspectScores
    ai_summary: str | None = None
    reviews: list[ReviewItem] = Field(default_factory=list)
    calendar: list[CalendarDay] = Field(default_factory=list)
