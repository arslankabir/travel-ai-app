# Deploy progress log

Track production deployment for the travel-ai-app submission.  
Stack: **Supabase** (Postgres) · **Railway** (FastAPI) · **Vercel** (Next.js)

---

## Live URLs (submission)

| Service | URL |
| :--- | :--- |
| **Frontend (Vercel)** | https://travel-ai-app-five.vercel.app |
| **API (Railway)** | https://travel-ai-app-production-bc05.up.railway.app |
| **Database (Supabase)** | Project `unrkkzzmeumoogivclpv` · region Seoul |

**Local full corpus:** Docker Postgres `travel_db` — ~50K listings / ~262K reviews (assignment minimums).  
**Production slice:** Supabase — 11,850 listings / 56,007 reviews (Lisbon + Barcelona).

---

## Checklist

| Step | Status | Notes |
| :--- | :---: | :--- |
| Supabase project created | ✅ | Project ref: `unrkkzzmeumoogivclpv` · region: Seoul |
| Extensions (`postgis`, `vector`) | ✅ | |
| Schema (`init-extensions.sql`) | ✅ | listings, reviews, calendar, listing_review_summaries |
| Deploy data slice ingested | ✅ | 2026-06-28 — 11,850 listings, all embedded |
| Railway API deployed | ✅ | Session pooler + PORT/socat fixes — see fix log |
| Vercel frontend deployed | ✅ | Root `frontend` · `NEXT_PUBLIC_API_URL` → Railway |
| Production smoke test | ✅ | 2026-06-28 — curl + UI (see below) |
| Live URL in README / submission | ✅ | URLs above |

---

## Vercel (frontend)

- **Project:** `travel-ai-app`
- **Production domain:** https://travel-ai-app-five.vercel.app
- **Root Directory:** `frontend`
- **Env:** `NEXT_PUBLIC_API_URL=https://travel-ai-app-production-bc05.up.railway.app` (no trailing slash)

**Railway CORS** (after Vercel deploy):

```
CORS_ORIGINS=https://travel-ai-app-five.vercel.app,http://localhost:3000
```

---

## Railway (API)

- **Project:** `giving-quietude` · service: `travel-ai-app`
- **Public URL:** https://travel-ai-app-production-bc05.up.railway.app
- **Status:** ✅ `GET /health` → `{"status":"ok","db":true}`

### Production LLM config (DeepSeek chat + OpenAI embeddings)

| Variable | Purpose |
| :--- | :--- |
| `OPENAI_API_KEY` | **Embeddings only** (ingest + live `embed_query`) |
| `LLM_PROVIDER` | `openai` (= any OpenAI-compatible chat API) |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` |
| `LLM_API_KEY` | DeepSeek chat key |
| `LLM_MODEL_INTENT` | `deepseek-chat` |
| `LLM_MODEL_REVIEW` | `deepseek-chat` |
| `LLM_MODEL_ITINERARY` | `deepseek-reasoner` |

Chat is pluggable via `LLM_BASE_URL` + `LLM_API_KEY` (`ModelFactory`). Embeddings stay OpenAI-only.

---

## Production smoke test (2026-06-28)

```bash
API="https://travel-ai-app-production-bc05.up.railway.app"

# Health + DB
curl -sS "$API/health"
# → {"status":"ok","db":true}

# Listings (SQL — no LLM)
curl -sS "$API/api/listings?city=lisbon&limit=3"
# → total: 8450, items with names/prices

# NL search (DeepSeek intent)
curl -sS -N -X POST "$API/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"user_input":"quiet 1-bed in Lisbon under 130","mode":"search"}'
# → filters_parsed: city=lisbon, max_price=130, bedrooms=1, vibe=quiet (~1.7s)

# Concierge (DeepSeek + OpenAI embeddings)
curl -sS -N -X POST "$API/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"user_input":"Find a quiet 1-bedroom in Lisbon under 130 with good reviews","mode":"concierge"}'
# → listings_loaded: 8 stays, semantic scores ~0.66–0.68 (~4.8s)

# Compare (DeepSeek review)
curl -sS -X POST "$API/api/batch/compare" \
  -H "Content-Type: application/json" \
  -d '{"listing_ids":["33348","45855270"]}'
# → verdict uses property names (Happy Season, Rossio Garden Hotel)
```

**UI:** https://travel-ai-app-five.vercel.app — Lisbon search, map, concierge verified.

---

## Railway + Supabase connection fix log

| # | Symptom | Cause | Fix |
|:-:|:---|:---|:---|
| 1 | Build failed | No root `Dockerfile` | Repo-root `Dockerfile` copies `backend/`; Root Directory **empty** |
| 2 | Healthcheck failed | Uvicorn on 8000, Railway `PORT`=8080 | `${PORT:-8000}` + `backend/start.sh` |
| 3 | Public **502**, deploy OK | Edge routes to **8000**, app on **8080** | `socat` forwards 8000→8080 in `start.sh` |
| 4 | `"db": false` | `DATABASE_URL` = localhost | Supabase URI on Railway |
| 5 | IPv6 **Network is unreachable** | Direct `db.*.supabase.co` is IPv6 | **Session pooler** URI (IPv4) |
| 6 | `tenant/user not found` | Hand-built pooler URI | Copy from Supabase → Connect → Session pooler |
| 7 | ✅ **`db:true`** | Session pooler + `%25` password encoding | See below |

### Working `DATABASE_URL` on Railway (Session pooler)

```
postgresql://postgres.unrkkzzmeumoogivclpv:PASSWORD@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres
```

| Context | User | Host |
| :--- | :--- | :--- |
| **Local ingest** (Mac) | `postgres` | `db.unrkkzzmeumoogivclpv.supabase.co` |
| **Railway API** (prod) | `postgres.unrkkzzmeumoogivclpv` | `aws-1-ap-northeast-2.pooler.supabase.com` |

---

## Supabase connection

### Local ingest (direct — IPv6 OK on Mac)

```
postgresql://postgres:PASSWORD@db.unrkkzzmeumoogivclpv.supabase.co:5432/postgres
```

### Railway API (Session pooler — IPv4 required)

Copy from Supabase → **Connect** → **Session pooler** (port 5432).

---

## Ingest commands used

```bash
cd /Users/arsalankabeer/DevPer/Interviews/travel-ai-app
export SUPABASE_DATABASE_URL='postgresql://postgres:...@db....supabase.co:5432/postgres'
cd ingestion && source .venv/bin/activate && cd ..
./scripts/ingest-deploy-slice.sh smoke
set -a && source .env && set +a
export SUPABASE_DATABASE_URL='...'
./scripts/ingest-deploy-slice.sh
```

### Final deploy slice stats

| Metric | Value |
| :--- | ---: |
| Lisbon listings | 8,450 |
| Barcelona listings | 3,400 |
| **Total listings** | **11,850** |
| With embeddings | 11,850 |
| Reviews | 56,007 |
| Calendar rows | 1,078,350 |

---

## Data verification

### Local (assignment scale — Docker `travel_db`)

```bash
PGPASSWORD=postgrespassword psql -h localhost -U postgres -d travel_db -c "
SELECT city, COUNT(*) AS listings,
       COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
FROM listings GROUP BY city ORDER BY city;
SELECT COUNT(*) AS total_listings FROM listings;
SELECT COUNT(*) FROM reviews;
"
```

**Expected locally:** ≥50,000 listings · ≥200,000 reviews · ≥2 cities · embeddings ≈ listing count.

### Production (Supabase SQL editor)

```sql
SELECT city, COUNT(*) AS listings,
       COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
FROM listings GROUP BY city ORDER BY city;
SELECT COUNT(*) FROM listings;
SELECT COUNT(*) FROM reviews;
```

**Expected prod:** Lisbon 8,450 · Barcelona 3,400 · 11,850 embedded · 56,007 reviews.

---

## Code changes for deploy (in repo)

| File | Purpose |
| :--- | :--- |
| Root `Dockerfile` + `backend/start.sh` | Monorepo build; PORT + socat 8000→8080 |
| `backend/app/db/connection.py` | SSL; `db` + `db_error` on `/health` |
| `backend/app/agents/factory.py` | Pluggable chat (`LLM_BASE_URL` + `LLM_API_KEY`); OpenAI embeddings locked |
| `scripts/ingest-deploy-slice.sh` | One-command Supabase slice ingest |

---

## Troubleshooting

| Issue | Fix |
| :--- | :--- |
| `python: command not found` (ingest) | `cd ingestion && source .venv/bin/activate` |
| Public 502 | `start.sh` socat; or set Networking port to 8080 |
| `db: false` | Session pooler URI; encode `%` as `%25`; not localhost |
| CORS on Vercel | Add `https://travel-ai-app-five.vercel.app` to `CORS_ORIGINS` |
| Empty UI listings | Check Vercel `NEXT_PUBLIC_API_URL` + redeploy |
| Concierge no results | `OPENAI_API_KEY` required for query embeddings |
| DeepSeek not used | `LLM_BASE_URL` + `LLM_API_KEY`; push ModelFactory fix |

---

## Remaining (optional)

- [ ] Record Loom walkthrough (filter, NL, concierge, failure case)
- [ ] Add live URLs to submission email
- [ ] Production failure-case demo for eval
