# Project Progress

Living status doc for the Travel AI assignment. Update whenever major milestones complete or blockers resolve.

**Last updated:** 2026-06-28  
**Current phase:** Phase 2 in progress — FastAPI search API + Next.js split-screen map  
**Related docs:** [PROJECT_PLAN.md](./PROJECT_PLAN.md) · [HL-component-diagram.md](./HL-component-diagram.md) · [Full Stack AI Developer Assignment.md](./Full%20Stack%20AI%20Developer%20Assignment.md)

## How to update this file

**Append-only ingest logs.** When adding a new run, create a **new dated section** under [Ingest timeline](#ingest-timeline) — do not replace or overwrite previous commands/logs. Each entry: **when**, **why**, **commands**, **terminal output as-is**.

---

## Assignment target (minimums)

| Requirement | Target | Raw data | Ingested (DB, latest) |
| :--- | ---: | ---: | ---: |
| Cities | ≥ 2 | **5** | **5** ✅ |
| Listings | ≥ 50,000 | **78,374** | **50,037** ✅ |
| Reviews | ≥ 200,000 | **4,797,484** | **262,461** ✅ |

Raw corpus in `ingestion/raw_data/` exceeds minimums. DB counts reflect **validated** listings (id/lat/lon/price required) + per-listing review cap (see [Ingest timeline](#ingest-timeline)).

Source: [Inside Airbnb](https://insideairbnb.com/get-the-data/) · files under `ingestion/raw_data/{city}/`

---

## Raw data inventory

Verified 2026-06-28 (pandas row counts — do not use `wc -l` on CSVs; multiline fields inflate counts).

| City | Listings | Reviews |
| :--- | ---: | ---: |
| lisbon | 24,950 | 1,831,862 |
| amsterdam | 10,480 | 501,084 |
| barcelona | 16,107 | 992,991 |
| bergamo | 3,835 | 142,449 |
| madrid | 23,002 | 1,329,098 |
| **TOTAL** | **78,374** | **4,797,484** |

**Verify anytime:**
```bash
cd ingestion && source .venv/bin/activate && python -c "
from pathlib import Path; import pandas as pd
raw = Path('raw_data')
rows = [(d.name, len(pd.read_csv(d/'listings.csv.gz', usecols=['id'])), len(pd.read_csv(d/'reviews.csv.gz', usecols=['listing_id']))) for d in sorted(raw.iterdir()) if d.is_dir()]
print(f\"{'City':<12} {'Listings':>12} {'Reviews':>12}\")
for city,l,r in rows: print(f'{city:<12} {l:>12,} {r:>12,}')
print(f\"{'TOTAL':<12} {sum(x[1] for x in rows):>12,} {sum(x[2] for x in rows):>12,}\")
"
```

---

## Overall status

| Phase | Hours (plan) | Status | Notes |
| :--- | :--- | :--- | :--- |
| **1** Database & Ingestion | 0–8 | ✅ Done | 5 cities in DB; all minimums met |
| **2** Core Search & Map | 8–18 | 🟡 In progress | FastAPI `/api/listings` + Next.js list/map UI |
| **3** AI Layer | 18–32 | ⬜ Not started | LangGraph, hybrid SSE, trace |
| **4** Detail, Compare, Polish | 32–40 | ⬜ Not started | |
| **5** Deploy, Eval, Loom | 40–48 | ⬜ Not started | |

---

## Done

### Planning & architecture
- [x] Assignment gap analysis and plan reconciliation
- [x] `PROJECT_PLAN.md` — stack, `.env`, ingestion, agents, hybrid SSE, phases, trade-offs
- [x] `HL-component-diagram.md` — Mermaid diagrams
- [x] Key decisions: Postgres + PostGIS + pgvector (`halfvec(512)`), fixed OpenAI embeddings, pluggable chat LLMs, LangGraph routing, hybrid SSE

### Phase 1 — infrastructure
- [x] `docker-compose.yml` — Postgres + Redis (OrbStack)
- [x] `Dockerfile.db` — PostGIS 16 + pgvector
- [x] `init-extensions.sql` — schema + indexes (GIST, HNSW)
- [x] `.env.example`, `.env`, `.gitignore`, `README.md`

### Phase 1 — raw data
- [x] 5 cities downloaded (incl. **madrid** 2026-06-28)
- [x] Assignment minimums met in DB (see table above)

### Phase 1 — ingestion pipeline (`ingestion/scripts/ingest.py`)
- [x] **5 cities:** `lisbon`, `amsterdam`, `barcelona`, `bergamo`, **`madrid`** — case-insensitive folder lookup via `resolve_city_dir()`
- [x] **Category A (deterministic):**
  - Listings: drop rows missing id/lat/lon/price; PostGIS `geometry` from lat/lon
  - **Price percentile** per neighborhood
  - **Amenity normalization** → canonical JSONB (`wifi`, `kitchen`, `pool`, …)
  - Reviews: filter to ingested listing IDs; **cap at N most recent per listing** (`REVIEWS_PER_LISTING`, default **5**); chunked two-pass load; **language** (`langdetect`); **topic tags**
  - **Calendar: 90-day rolling window** from today (`CALENDAR_WINDOW_DAYS`, default `90`); availability + optional nightly price
  - Per-city **replace strategy:** delete existing rows for that city/listings before insert (`ON CONFLICT` upsert on listings)
- [x] **Category B (embeddings):** OpenAI `text-embedding-3-small` @ **512-dim** → `halfvec` (listing descriptions only)
- [x] **CLI:** `--city`, `--limit`, `--skip-embeddings`, **`--reviews-only`**, **`--reviews-per-listing`**, **`--skip-review-enrichment`**
- [x] **Env:** `DATABASE_URL`, `OPENAI_API_KEY`, `EMBEDDING_MODEL`, `VECTOR_DIMENSION`, `EMBED_BATCH_SIZE`, `CALENDAR_WINDOW_DAYS`, **`REVIEWS_PER_LISTING`**
- [x] **Full 4-city ingest @ 5 reviews/listing** (2026-06-28) — [log](#2026-06-28--full-ingest-5-reviewslisting)
- [x] **Review re-ingest @ 7 reviews/listing** (2026-06-28) — [log](#2026-06-28--review-re-ingest-7-reviewslisting)
- [x] **Madrid sliced ingest** (2026-06-28) — [log](#2026-06-28--madrid-sliced-ingest-50k-listings)

### Issues resolved
- [x] Postgres.app vs OrbStack port **5432** conflict
- [x] `halfvec` NULL insert — `CAST(:embedding AS halfvec)`
- [x] pandas `NaN` in text columns — `null_if_nan()`
- [x] Lisbon & Barcelona `calendar.csv` have **no `price` column** — ingest availability only; nightly price stored as `NULL` (use listing base price at query time). Amsterdam & Bergamo include calendar price.

---

## In progress / next up

### Phase 2 — Core Search & Map (current)
- [x] Scaffold FastAPI backend (`backend/app/`)
- [x] `GET /api/listings` — city, price, rating, guests, bedrooms, amenity, check-in/out availability, bbox, sort, pagination
- [x] `GET /api/listings/{id}` — single listing card
- [x] Next.js split-screen: `FilterBar`, `ListingList`, `MapView` (MapLibre + clustering)
- [x] List ↔ map hover sync; optional map-bounds filter
- [ ] Guest selector polish (children soft label)
- [ ] Map/list UX polish (Booking-style density — Phase 4 overlap)

### Phase 1 — remaining (optional)
- [ ] Document ingest slice strategy in README (raw vs validated, review caps, madrid `--limit 10100`)
- [ ] Hybrid query < 50ms benchmark
- [ ] Implement `enrich_reviews.py` (precomputed summaries for deploy slice)
- [ ] Implement `export_deploy.py` (Supabase slice)

### Phase 2 — run locally
```bash
docker compose up -d
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
cd frontend && cp .env.local.example .env.local && npm run dev
```

**Smoke test (2026-06-28):**
```bash
curl -s "http://127.0.0.1:8000/health"
curl -s "http://127.0.0.1:8000/api/listings?city=lisbon&limit=2"
# → total: 21466, items with lat/lon/amenities
npm run build  # frontend — pass
```

---

## Ingest timeline

Append-only log of each ingest step (what / when / why / commands / output).

---

### 2026-06-28 — Madrid sliced ingest (50K listings)

**Why:** After [7-review re-ingest](#2026-06-28--review-re-ingest-7-reviewslisting), DB had **43,592 listings** — below **≥50,000** minimum. Re-ingesting all 4 cities with relaxed validation would require re-embedding everything. **Faster path:** add **madrid** raw data (23K listings) and ingest a **slice** only — `--limit 10100` raw rows → **6,445 validated** → **50,037 total** in DB. Reviews already at 222K ✅; used `--reviews-per-listing 7` for consistency.

**Commands:**
```bash
cd ingestion && source .venv/bin/activate
python scripts/ingest.py --city madrid --limit 10100 --reviews-per-listing 7
```

**Result:**

| Metric | Count |
| :--- | ---: |
| Madrid listings (validated) | 6,445 |
| Madrid reviews (7 cap) | 40,132 |
| Madrid calendar (90-day) | 586,495 |
| **DB total listings** | **50,037** ✅ |
| **DB total reviews** | **262,461** ✅ |

**Terminal log (as run):**
```
(.venv) arsalankabeer@Arsalans-MacBook-Pro ingestion % python scripts/ingest.py --city madrid --limit 10100 --reviews-per-listing 7


=== Ingesting madrid ===
  Listings after validation: 6,445
Embedding listings: 100%|███████████████████████| 65/65 [00:33<00:00,  1.96it/s]
  Inserting 6,445 listings...
  Review cap: 7 most recent per listing
  Scanning reviews (pass 1): 6chunk [00:01,  4.28chunk/s]
  Reviews selected (≤7 per listing): 40,132
  Loading reviews (pass 2): 6chunk [00:02,  2.22chunk/s]
  Language detect: 100%|█████████████████| 40132/40132 [00:40<00:00, 994.60it/s]
  Reviews to ingest: 40,132
  Inserting 40,132 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 586,495
  Inserting 586,495 calendar rows...

=== Database stats ===
  Listings:  50,037 (50,037 with embeddings)
  Reviews:   262,461
  Calendar:  4,459,383
    amsterdam: 5,874
    barcelona: 12,730
    bergamo: 3,522
    lisbon: 21,466
    madrid: 6,445

Done.
```

---

### 2026-06-28 — Review re-ingest (7 reviews/listing)

**Why:** After the [5-review full ingest](#2026-06-28--full-ingest-5-reviewslisting), DB had only **165,459 reviews** — below the assignment **≥200,000** minimum. Re-ran all cities with `--reviews-only --reviews-per-listing 7` to add more reviews **without re-embedding listings** (~$0 OpenAI cost).

**Why the earlier ~259K estimate was wrong (planning mistake):**

1. **Used raw listing count, not validated.** Plan assumed ~55K listings × 5 ≈ 259K reviews. Ingest only keeps **43,592** listings after dropping rows missing price/lat/lon — so the ceiling was ~**218K** (43,592 × 5), not 259K.
2. **Cap is “up to N”, not “exactly N”.** Many listings have **fewer than 5 reviews** in the corpus (new listings, sparse markets). Actual avg ≈ **3.8 reviews/listing** at cap=5 → 165K total, not 218K.
3. **Listing validation + sparse reviews compound.** Amsterdam validated 5,874 vs 10,480 raw; bergamo 3,522 vs 3,835 — fewer listings means fewer review slots.

**Commands:**
```bash
cd ingestion && source .venv/bin/activate
python scripts/ingest.py --city lisbon --reviews-only --reviews-per-listing 7
python scripts/ingest.py --city amsterdam --reviews-only --reviews-per-listing 7
python scripts/ingest.py --city barcelona --reviews-only --reviews-per-listing 7
python scripts/ingest.py --city bergamo --reviews-only --reviews-per-listing 7
```

**Per-city summary:**

| City | Reviews (7 cap) | Cumulative DB reviews |
| :--- | ---: | ---: |
| lisbon | 116,154 | 195,862 |
| amsterdam | 30,382 | 203,299 |
| barcelona | 58,218 | 218,029 |
| bergamo | 17,581 | **222,329** |
| **TOTAL** | **222,335** | |

**Final DB stats:** 43,592 listings (all embedded) · **222,329 reviews** ✅ · 3,872,888 calendar rows

**Terminal log (as run):**
```
(.venv) arsalankabeer@Arsalans-MacBook-Pro ingestion % python scripts/ingest.py --city lisbon --reviews-only --reviews-per-listing 7
python scripts/ingest.py --city amsterdam --reviews-only --reviews-per-listing 7
python scripts/ingest.py --city barcelona --reviews-only --reviews-per-listing 7
python scripts/ingest.py --city bergamo --reviews-only --reviews-per-listing 7

=== Ingesting lisbon ===
  Reviews-only mode: 21,466 listings from DB
  Review cap: 7 most recent per listing
  Scanning reviews (pass 1): 8chunk [00:02,  3.63chunk/s]
  Reviews selected (≤7 per listing): 116,154
  Loading reviews (pass 2): 8chunk [00:04,  1.82chunk/s]
  Language detect: 100%|██████████████| 116154/116154 [01:54<00:00, 1017.46it/s]
  Reviews to ingest: 116,154
  Inserting 116,154 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 1,953,406
  Inserting 1,953,406 calendar rows...

=== Database stats ===
  Listings:  43,592 (43,592 with embeddings)
  Reviews:   195,862
  Calendar:  3,872,888
    amsterdam: 5,874
    barcelona: 12,730
    bergamo: 3,522
    lisbon: 21,466

Done.

=== Ingesting amsterdam ===
  Reviews-only mode: 5,874 listings from DB
  Review cap: 7 most recent per listing
  Scanning reviews (pass 1): 3chunk [00:00,  4.97chunk/s]
  Reviews selected (≤7 per listing): 30,382
  Loading reviews (pass 2): 3chunk [00:01,  2.39chunk/s]
  Language detect: 100%|████████████████| 30382/30382 [00:29<00:00, 1037.40it/s]
  Reviews to ingest: 30,382
  Inserting 30,382 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 440,550
  Inserting 440,550 calendar rows...

=== Database stats ===
  Listings:  43,592 (43,592 with embeddings)
  Reviews:   203,299
  Calendar:  3,872,888
    amsterdam: 5,874
    barcelona: 12,730
    bergamo: 3,522
    lisbon: 21,466

Done.

=== Ingesting barcelona ===
  Reviews-only mode: 12,730 listings from DB
  Review cap: 7 most recent per listing
  Scanning reviews (pass 1): 4chunk [00:01,  3.20chunk/s]
  Reviews selected (≤7 per listing): 58,212
  Loading reviews (pass 2): 4chunk [00:02,  1.64chunk/s]
  Language detect: 100%|████████████████| 58218/58218 [00:56<00:00, 1033.16it/s]
  Reviews to ingest: 58,218
  Inserting 58,218 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 1,158,430
  Inserting 1,158,430 calendar rows...

=== Database stats ===
  Listings:  43,592 (43,592 with embeddings)
  Reviews:   218,029
  Calendar:  3,872,888
    amsterdam: 5,874
    barcelona: 12,730
    bergamo: 3,522
    lisbon: 21,466

Done.

=== Ingesting bergamo ===
  Reviews-only mode: 3,522 listings from DB
  Review cap: 7 most recent per listing
  Scanning reviews (pass 1): 1chunk [00:00,  5.69chunk/s]
  Reviews selected (≤7 per listing): 17,581
  Loading reviews (pass 2): 1chunk [00:00,  3.23chunk/s]
  Language detect: 100%|████████████████| 17581/17581 [00:16<00:00, 1049.61it/s]
  Reviews to ingest: 17,581
  Inserting 17,581 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 320,502
  Inserting 320,502 calendar rows...

=== Database stats ===
  Listings:  43,592 (43,592 with embeddings)
  Reviews:   222,329
  Calendar:  3,872,888
    amsterdam: 5,874
    barcelona: 12,730
    bergamo: 3,522
    lisbon: 21,466

Done.
```

---

### 2026-06-28 — Full ingest (5 reviews/listing)

**Why:** First production ingest of all 4 cities with `REVIEWS_PER_LISTING=5` to avoid loading 3.4M reviews. Lisbon listings+embeddings already in DB → `--reviews-only` for lisbon; full ingest for other cities.

**Commands:**
```bash
cd ingestion && source .venv/bin/activate
python scripts/ingest.py --city lisbon --reviews-only
python scripts/ingest.py --city amsterdam
python scripts/ingest.py --city barcelona
python scripts/ingest.py --city bergamo
```

**Per-city summary:**

| City | Command | Listings (validated) | Reviews (5 cap) | Calendar (90-day) |
| :--- | :--- | ---: | ---: | ---: |
| lisbon | `--reviews-only` | 21,466 (from DB) | 85,751 | 1,953,406 |
| amsterdam | full | 5,874 | 22,945 | 440,550 |
| barcelona | full | 12,730 | 43,486 | 1,158,430 |
| bergamo | full | 3,522 | 13,281 | 320,502 |
| **TOTAL** | | **43,592** | **165,463** | **3,872,888** |

**Final DB stats:** 43,592 listings (all embedded) · 165,459 reviews · 3,872,888 calendar rows

**Terminal log (as run):**
```
(.venv) arsalankabeer@Arsalans-MacBook-Pro ingestion % python scripts/ingest.py --city lisbon --reviews-only

=== Ingesting lisbon ===
  Reviews-only mode: 21,466 listings from DB
  Review cap: 5 most recent per listing
  Scanning reviews (pass 1): 8chunk [00:02,  3.49chunk/s]
  Reviews selected (≤5 per listing): 85,751
  Loading reviews (pass 2): 8chunk [00:04,  1.87chunk/s]
  Language detect: 100%|████████████████| 85751/85751 [01:23<00:00, 1025.88it/s]
  Reviews to ingest: 85,751
  Inserting 85,751 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 1,953,406
  Inserting 1,953,406 calendar rows...

=== Database stats ===
  Listings:  21,484 (21,466 with embeddings)
  Reviews:   88,027
  Calendar:  1,955,044
    barcelona: 9
    bergamo: 9
    lisbon: 21,466

Done.
(.venv) arsalankabeer@Arsalans-MacBook-Pro ingestion % python scripts/ingest.py --city amsterdam


=== Ingesting amsterdam ===
  Listings after validation: 5,874
Embedding listings: 100%|███████████████████████| 59/59 [00:34<00:00,  1.72it/s]
  Inserting 5,874 listings...
  Review cap: 5 most recent per listing
  Scanning reviews (pass 1): 3chunk [00:00,  4.97chunk/s]
  Reviews selected (≤5 per listing): 22,945
  Loading reviews (pass 2): 3chunk [00:01,  2.47chunk/s]
  Language detect: 100%|████████████████| 22945/22945 [00:21<00:00, 1047.04it/s]
  Reviews to ingest: 22,945
  Inserting 22,945 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 440,550
  Inserting 440,550 calendar rows...

=== Database stats ===
  Listings:  27,358 (27,340 with embeddings)
  Reviews:   110,972
  Calendar:  2,395,594
    amsterdam: 5,874
    barcelona: 9
    bergamo: 9
    lisbon: 21,466

Done.
(.venv) arsalankabeer@Arsalans-MacBook-Pro ingestion % python scripts/ingest.py --city barcelona


=== Ingesting barcelona ===
  Listings after validation: 12,730
Embedding listings: 100%|█████████████████████| 128/128 [01:02<00:00,  2.03it/s]
  Inserting 12,730 listings...
  Review cap: 5 most recent per listing
  Scanning reviews (pass 1): 4chunk [00:01,  3.37chunk/s]
  Reviews selected (≤5 per listing): 43,482
  Loading reviews (pass 2): 4chunk [00:02,  1.72chunk/s]
  Language detect: 100%|████████████████| 43486/43486 [00:40<00:00, 1069.90it/s]
  Reviews to ingest: 43,486
  Inserting 43,486 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 1,158,430
  Inserting 1,158,430 calendar rows...

=== Database stats ===
  Listings:  40,079 (40,070 with embeddings)
  Reviews:   152,223
  Calendar:  3,553,205
    amsterdam: 5,874
    barcelona: 12,730
    bergamo: 9
    lisbon: 21,466

Done.
(.venv) arsalankabeer@Arsalans-MacBook-Pro ingestion % python scripts/ingest.py --city bergamo


=== Ingesting bergamo ===
  Listings after validation: 3,522
Embedding listings: 100%|███████████████████████| 36/36 [00:19<00:00,  1.88it/s]
  Inserting 3,522 listings...
  Review cap: 5 most recent per listing
  Scanning reviews (pass 1): 1chunk [00:00,  5.22chunk/s]
  Reviews selected (≤5 per listing): 13,281
  Loading reviews (pass 2): 1chunk [00:00,  3.44chunk/s]
  Language detect: 100%|████████████████| 13281/13281 [00:12<00:00, 1071.10it/s]
  Reviews to ingest: 13,281
  Inserting 13,281 reviews...
  Processing calendar (90-day window)...
  Calendar rows: 320,502
  Inserting 320,502 calendar rows...

=== Database stats ===
  Listings:  43,592 (43,592 with embeddings)
  Reviews:   165,459
  Calendar:  3,872,888
    amsterdam: 5,874
    barcelona: 12,730
    bergamo: 3,522
    lisbon: 21,466

Done.
```

---

### 2026-06-27 — Smoke tests

**Why:** Validate pipeline (`halfvec`, calendar, review matching) on small slices before full ingest / OpenAI spend.

**Commands:**
```bash
cd ingestion && source .venv/bin/activate
python scripts/ingest.py --city lisbon --limit 100 --skip-embeddings
python scripts/ingest.py --city bergamo --limit 10 --skip-embeddings
python scripts/ingest.py --city barcelona --limit 10 --skip-embeddings
```

| Run | Listings (validated) | Reviews | Calendar (90-day) |
| :--- | ---: | ---: | ---: |
| lisbon `--limit 100` | 88 | 21,403 | 8,008 |
| bergamo `--limit 10` | 9 | 1,198 | 819 |
| barcelona `--limit 10` | 9 | 2,231 | 819 |

**Note:** Pre-slice runs loaded all matching reviews for the listing set; later runs use per-listing cap.

---

## Not started

- Backend (`/backend`) — FastAPI, ModelFactory, LangGraph, routers, TraceStore
- Frontend (`/frontend`) — Next.js, FilterBar, MapView, NL search bar, ChatConsole
- Property detail, compare, wishlist, mock booking
- Redis caching layer (container running; app not wired)
- Supabase deploy slice + Railway/Vercel deployment
- `EVAL.md`, README architecture diagram, 5-min Loom

---

## Local environment

| Service | How to run | Connection |
| :--- | :--- | :--- |
| Postgres + PostGIS + pgvector | `docker compose up -d` (OrbStack) | `localhost:5432` / `travel_db` |
| Redis | same compose | `localhost:6379` |
| Ollama (chat dev) | Native on M4, not Docker | `localhost:11434` |

**Important:** Quit **Postgres.app** if ingest fails with `database "travel_db" does not exist` on `127.0.0.1:5432`.

---

## Deliverables checklist (assignment)

| Deliverable | Status |
| :--- | :--- |
| Public GitHub repo | ⬜ |
| One-command local run | 🟡 DB only (`docker compose up`) |
| Architecture diagram (README) | ⬜ |
| Live deployed URL | ⬜ |
| 5-min Loom | ⬜ |
| `EVAL.md` | ⬜ |

---

## Known trade-offs (see PROJECT_PLAN §15)

- Local **50K validated listings** / **262K ingested reviews** (7 per listing cap; raw corpus 78K / 4.8M)
- Deployed ~10–15K listing slice (Supabase free tier)
- Listing embeddings only (no review vectors)
- **90-day calendar window** (not full calendar history)
- Single photo + placeholders for gallery
- Review filter by topic/language, not per-review score
- Dubai golden query → demo on Lisbon/Amsterdam

---

## Changelog

### 2026-06-28 (Phase 2 scaffold)
- FastAPI backend: `/health`, `/api/listings`, `/api/listings/{id}` against live 50K DB
- Next.js 14 frontend: split-screen search + MapLibre map (clustering, hover sync, bbox filter)
- README Phase 2 quick start; `.env.example` CORS + `frontend/.env.local.example`

### 2026-06-28 (madrid sliced ingest)
- Added `madrid` to `ingest.py`; `--limit 10100 --reviews-per-listing 7` → **50,037 listings**, **262,461 reviews** — all assignment minimums ✅

### 2026-06-28 (7 reviews/listing re-ingest)
- All cities `--reviews-only --reviews-per-listing 7` → **222,329 reviews** in DB (≥200K ✅)
- Documented why ~259K @ 5/listing estimate was wrong (validated count + sparse reviews)

### 2026-06-28 (full ingest @ 5)
- All 4 cities ingested: 43,592 listings, 165,459 reviews, 3.87M calendar rows
- Phase 1 ingest complete; optional review cap bump for 200K+ milestone

### 2026-06-28 (later)
- Lisbon `--reviews-only` finished in ~2.5 min: 85,751 reviews + 1.95M calendar rows

### 2026-06-28
- Review slicing: `REVIEWS_PER_LISTING=5`; chunked two-pass load; progress bars
- Initial plan claimed ~259K reviews at 5/listing — **incorrect** (see [7-review re-ingest section](#2026-06-28--review-re-ingest-7-reviewslisting))
- `--reviews-only` to resume Lisbon without re-embedding; `--skip-review-enrichment` optional
- Lisbon: 21,466 listings + embeddings in DB

### 2026-06-27 (later)
- Raw data: 4 cities downloaded; assignment minimums verified
- `ingest.py` updated for all 4 cities + case-insensitive folder lookup
- Progress doc: assignment target table, raw data inventory, ingest pipeline details (90-day calendar, enrichments, env vars)

### 2026-06-27
- Initial progress doc after Phase 1 scaffold + Lisbon smoke test
- Planning docs finalized (`PROJECT_PLAN.md`, `HL-component-diagram.md`)
- Ingest pipeline bugs fixed (halfvec, NaN, calendar price column)
