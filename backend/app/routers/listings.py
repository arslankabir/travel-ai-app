import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.connection import get_db
from app.schemas.listings import ListingCard, ListingsResponse, SortOption

router = APIRouter(prefix="/listings", tags=["listings"])

SORT_SQL: dict[SortOption, str] = {
    "price_asc": "l.price ASC NULLS LAST",
    "price_desc": "l.price DESC NULLS LAST",
    "rating_desc": "l.review_scores_rating DESC NULLS LAST",
    "reviews_desc": "l.number_of_reviews DESC NULLS LAST",
}

SELECT_COLS = """
    l.id, l.city, l.name, l.neighborhood, l.property_type, l.room_type,
    l.price, l.review_scores_rating, l.number_of_reviews, l.picture_url,
    l.latitude, l.longitude, l.accommodates, l.bedrooms, l.amenities
"""


def _parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    parts = [p.strip() for p in bbox.split(",")]
    if len(parts) != 4:
        raise HTTPException(400, "bbox must be min_lng,min_lat,max_lng,max_lat")
    try:
        min_lng, min_lat, max_lng, max_lat = (float(p) for p in parts)
    except ValueError as exc:
        raise HTTPException(400, "bbox values must be numbers") from exc
    return min_lng, min_lat, max_lng, max_lat


def _build_query(
    *,
    city: str | None,
    min_price: float | None,
    max_price: float | None,
    min_rating: float | None,
    accommodates: int | None,
    bedrooms: int | None,
    amenity: str | None,
    check_in: date | None,
    check_out: date | None,
    bbox: str | None,
    sort: SortOption,
) -> tuple[str, dict, str]:
    where = ["1=1"]
    params: dict = {}

    if city:
        where.append("l.city = :city")
        params["city"] = city.lower()
    if min_price is not None:
        where.append("l.price >= :min_price")
        params["min_price"] = min_price
    if max_price is not None:
        where.append("l.price <= :max_price")
        params["max_price"] = max_price
    if min_rating is not None:
        where.append("l.review_scores_rating >= :min_rating")
        params["min_rating"] = min_rating
    if accommodates is not None:
        where.append("l.accommodates >= :accommodates")
        params["accommodates"] = accommodates
    if bedrooms is not None:
        where.append("l.bedrooms >= :bedrooms")
        params["bedrooms"] = bedrooms
    if amenity:
        where.append("l.amenities @> CAST(:amenity_json AS jsonb)")
        params["amenity_json"] = json.dumps([amenity.lower()])
    if bbox:
        min_lng, min_lat, max_lng, max_lat = _parse_bbox(bbox)
        where.append(
            "l.geometry && ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)"
        )
        params.update(min_lng=min_lng, min_lat=min_lat, max_lng=max_lng, max_lat=max_lat)
    if check_in and check_out:
        if check_out <= check_in:
            raise HTTPException(400, "check_out must be after check_in")
        where.append(
            """
            NOT EXISTS (
                SELECT 1 FROM calendar c
                WHERE c.listing_id = l.id
                  AND c.date >= :check_in AND c.date < :check_out
                  AND NOT c.available
            )
            """
        )
        params["check_in"] = check_in
        params["check_out"] = check_out

    where_sql = " AND ".join(where)
    order_sql = SORT_SQL.get(sort, SORT_SQL["rating_desc"])
    base = f"FROM listings l WHERE {where_sql}"
    return base, params, order_sql


def _row_to_card(row) -> ListingCard:
    amenities = row.amenities or []
    if isinstance(amenities, str):
        amenities = json.loads(amenities)
    return ListingCard(
        id=row.id,
        city=row.city,
        name=row.name,
        neighborhood=row.neighborhood,
        property_type=row.property_type,
        room_type=row.room_type,
        price=float(row.price),
        review_scores_rating=float(row.review_scores_rating) if row.review_scores_rating is not None else None,
        number_of_reviews=int(row.number_of_reviews or 0),
        picture_url=row.picture_url,
        latitude=float(row.latitude),
        longitude=float(row.longitude),
        accommodates=row.accommodates,
        bedrooms=row.bedrooms,
        amenities=amenities,
    )


@router.get("", response_model=ListingsResponse)
def search_listings(
    city: str | None = None,
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    min_rating: float | None = Query(None, ge=0, le=100),
    accommodates: int | None = Query(None, ge=1),
    bedrooms: int | None = Query(None, ge=0),
    amenity: str | None = None,
    check_in: date | None = None,
    check_out: date | None = None,
    bbox: str | None = None,
    sort: SortOption = "rating_desc",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> ListingsResponse:
    base, params, order_sql = _build_query(
        city=city,
        min_price=min_price,
        max_price=max_price,
        min_rating=min_rating,
        accommodates=accommodates,
        bedrooms=bedrooms,
        amenity=amenity,
        check_in=check_in,
        check_out=check_out,
        bbox=bbox,
        sort=sort,
    )

    count_row = db.execute(text(f"SELECT COUNT(*) {base}"), params).one()
    total = int(count_row[0])

    params_with_page = {**params, "limit": limit, "offset": offset}
    rows = db.execute(
        text(
            f"""
            SELECT {SELECT_COLS}
            {base}
            ORDER BY {order_sql}
            LIMIT :limit OFFSET :offset
            """
        ),
        params_with_page,
    ).fetchall()

    return ListingsResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[_row_to_card(r) for r in rows],
    )


@router.get("/{listing_id}", response_model=ListingCard)
def get_listing(listing_id: int, db: Session = Depends(get_db)) -> ListingCard:
    row = db.execute(
        text(f"SELECT {SELECT_COLS} FROM listings l WHERE l.id = :id"),
        {"id": listing_id},
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Listing not found")
    return _row_to_card(row)
