-- Travel AI Platform — schema bootstrap
-- Runs automatically on first container start via docker-entrypoint-initdb.d

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
    id                  BIGINT PRIMARY KEY,
    city                TEXT NOT NULL,
    name                TEXT,
    description         TEXT,
    neighborhood        TEXT,
    property_type       TEXT,
    room_type           TEXT,
    accommodates        INTEGER,
    bedrooms            INTEGER,
    beds                INTEGER,
    bathrooms           NUMERIC(4, 1),
    price               NUMERIC(10, 2),
    price_percentile    NUMERIC(5, 4),
    amenities           JSONB DEFAULT '[]'::jsonb,
    picture_url         TEXT,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    geometry            GEOMETRY(Point, 4326),
    review_scores_rating        NUMERIC(4, 2),
    review_scores_cleanliness   NUMERIC(4, 2),
    review_scores_location      NUMERIC(4, 2),
    review_scores_value         NUMERIC(4, 2),
    review_scores_communication NUMERIC(4, 2),
    review_scores_checkin       NUMERIC(4, 2),
    number_of_reviews   INTEGER DEFAULT 0,
    host_id             BIGINT,
    host_name           TEXT,
    embedding           halfvec(512),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_city ON listings (city);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings (price);
CREATE INDEX IF NOT EXISTS idx_listings_rating ON listings (review_scores_rating);
CREATE INDEX IF NOT EXISTS idx_listings_geometry ON listings USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_listings_amenities ON listings USING GIN (amenities);
CREATE INDEX IF NOT EXISTS idx_listings_embedding ON listings USING hnsw (embedding halfvec_cosine_ops);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
    id              BIGINT PRIMARY KEY,
    listing_id      BIGINT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
    date            DATE,
    reviewer_id     BIGINT,
    reviewer_name   TEXT,
    comments        TEXT,
    language        TEXT,
    topics          JSONB DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_listing_id ON reviews (listing_id);
CREATE INDEX IF NOT EXISTS idx_reviews_language ON reviews (language);
CREATE INDEX IF NOT EXISTS idx_reviews_topics ON reviews USING GIN (topics);

-- ---------------------------------------------------------------------------
-- Calendar (90-day availability window at ingest)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar (
    listing_id  BIGINT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    available   BOOLEAN NOT NULL DEFAULT TRUE,
    price       NUMERIC(10, 2),
    PRIMARY KEY (listing_id, date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar (date);
CREATE INDEX IF NOT EXISTS idx_calendar_available ON calendar (listing_id, date) WHERE available = TRUE;

-- ---------------------------------------------------------------------------
-- Precomputed review summaries (deploy slice + on-demand cache)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_review_summaries (
    listing_id  BIGINT PRIMARY KEY REFERENCES listings (id) ON DELETE CASCADE,
    summary     TEXT NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
