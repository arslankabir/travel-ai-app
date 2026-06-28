# Deploy progress log

Track production deployment for the travel-ai-app submission.  
Stack: **Supabase** (Postgres) · **Railway** (FastAPI) · **Vercel** (Next.js)

---

## Checklist

| Step | Status | Notes |
| :--- | :---: | :--- |
| Supabase project created | ✅ | Project ref: `unrkkzzmeumoogivclpv` · region: Seoul |
| Extensions (`postgis`, `vector`) | ✅ | |
| Schema (`init-extensions.sql`) | ✅ | tables: listings, reviews, calendar, listing_review_summaries |
| Deploy data slice ingested | ✅ | 2026-06-28 — see logs below |
| Railway API deployed | ✅ | 2026-06-28 — see [Railway fixes](#railway--supabase-connection-fix-log) |
| Vercel frontend deployed | ⬜ | |
| Production smoke test | ⬜ | filter, NL search, concierge, failure case |
| Live URL in README / submission | ⬜ | API: `https://travel-ai-app-production-bc05.up.railway.app` |

---

## Railway (API)

- **Project:** `giving-quietude` · service: `travel-ai-app`
- **Public URL:** https://travel-ai-app-production-bc05.up.railway.app
- **Status (2026-06-28):** ✅ `GET /health` → `{"status":"ok","db":true}`

### Verify

```bash
curl https://travel-ai-app-production-bc05.up.railway.app/health
# {"status":"ok","db":true}

curl "https://travel-ai-app-production-bc05.up.railway.app/api/listings?city=lisbon&limit=3"
```

---

## Railway + Supabase connection fix log

Chronological issues and fixes (save this for future deploys):

| # | Symptom | Cause | Fix |
|:-:|:---|:---|:---|
| 1 | Build failed | No root `Dockerfile` | Repo-root `Dockerfile` copies `backend/`; Root Directory **empty** |
| 2 | Healthcheck failed | Uvicorn on 8000, Railway `PORT`=8080 | `${PORT:-8000}` in Dockerfile + `backend/start.sh` |
| 3 | Public **502**, deploy OK | Edge routes to **8000**, app on **8080** | `socat` forwards 8000→8080 in `start.sh` |
| 4 | `"db": false` | `DATABASE_URL` pointed at **localhost** | Use Supabase URI on Railway, not local Docker |
| 5 | `db_error`: IPv6 **Network is unreachable** | Direct `db.*.supabase.co` is IPv6; Railway has no IPv6 | Use **Session pooler** URI (IPv4), not direct host |
| 6 | `tenant/user postgres.unrkkzzmeumoogivclpv not found` | Wrong pooler host/region or hand-built URI | Copy URI exactly from Supabase → Connect → **Session pooler** |
| 7 | ✅ **`{"status":"ok","db":true}`** | Session pooler + encoded password | See working `DATABASE_URL` format below |

### Working `DATABASE_URL` on Railway (Session pooler)

Copy from Supabase → **Connect** → **Session pooler** (port **5432**). Shape:

```
postgresql://postgres.unrkkzzmeumoogivclpv:PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

| Context | User | Host |
| :--- | :--- | :--- |
| **Local ingest** (Mac) | `postgres` | `db.unrkkzzmeumoogivclpv.supabase.co` |
| **Railway API** (prod) | `postgres.unrkkzzmeumoogivclpv` | `aws-0-ap-northeast-2.pooler.supabase.com` |

- URL-encode `%` in password as **`%25`**
- No quotes around values in Railway Variables
- Code auto-adds `sslmode=require` for remote hosts (`backend/app/db/connection.py`)
- `/health` exposes `db_error` when `db: false` (deploy debugging)

### Required Railway variables

| Variable | Value |
| :--- | :--- |
| `DATABASE_URL` | Session pooler URI (above) |
| `OPENAI_API_KEY` | Production key |
| `LLM_PROVIDER` | `openai` |
| `LLM_BASE_URL` | `https://api.openai.com/v1` |
| `LLM_MODEL_INTENT` | `gpt-4o-mini` |
| `LLM_MODEL_REVIEW` | `gpt-4o-mini` |
| `LLM_MODEL_ITINERARY` | `gpt-4o` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` |
| `VECTOR_DIMENSION` | `512` |
| `CORS_ORIGINS` | `http://localhost:3000` (+ Vercel URL after frontend deploy) |

**Remove** `REDIS_URL=redis://localhost:6379/0` — in-memory cache on Railway.

### Code changes for Railway (in repo)

- Root `Dockerfile` + `backend/start.sh` (PORT + socat 8000→8080)
- `backend/app/db/connection.py` — SSL + `db_error` on `/health`
- `backend/app/main.py` — `/health` returns `db` + `db_error`

---

## Railway troubleshooting (archived)

## Supabase connection

### Local ingest (direct — IPv6 OK on Mac)

- **Host:** `db.unrkkzzmeumoogivclpv.supabase.co:5432`
- **User:** `postgres`
- **URI:** `postgresql://postgres:PASSWORD@db.unrkkzzmeumoogivclpv.supabase.co:5432/postgres`

### Railway API (Session pooler — IPv4 required)

- **Host:** `aws-0-ap-northeast-2.pooler.supabase.com:5432`
- **User:** `postgres.unrkkzzmeumoogivclpv`
- **URI:** copy from Supabase → Connect → **Session pooler**
- **URL-encode `%` in password** as `%25` when using the URI in shell exports.
- **Do not commit** passwords or API keys. Store `DATABASE_URL` in Railway env vars only.

---

## Ingest commands used

```bash
cd /Users/arsalankabeer/DevPer/Interviews/travel-ai-app

export SUPABASE_DATABASE_URL='postgresql://postgres:...@db.unrkkzzmeumoogivclpv.supabase.co:5432/postgres'

cd ingestion && source .venv/bin/activate && cd ..

# Smoke test (no embeddings)
./scripts/ingest-deploy-slice.sh smoke

# Full deploy slice (requires OPENAI_API_KEY from .env)
set -a && source .env && set +a
export SUPABASE_DATABASE_URL='...'
./scripts/ingest-deploy-slice.sh
```

---

## Ingest logs

### Smoke test — Lisbon 200 raw rows

```
=== Ingesting lisbon ===
  Listings after validation: 168
  Skipping embeddings (--skip-embeddings)
  Inserting 168 listings...
  Reviews to ingest: 821
  Calendar rows: 15,288

=== Database stats ===
  Listings:  168 (0 with embeddings)
  Reviews:   821
  Calendar:  15,288
    lisbon: 168
```

### Full deploy slice — Lisbon 10k + Barcelona 5k (with embeddings)

**Lisbon**

```
=== Ingesting lisbon ===
  Listings after validation: 8,450
  Embedding listings: 85/85 batches (~49s)
  Inserting 8,450 listings...
  Reviews to ingest: 40,205
  Calendar rows: 768,950

=== Database stats (after lisbon) ===
  Listings:  8,450 (8,450 with embeddings)
  Reviews:   40,205
  Calendar:  768,950
    lisbon: 8,450
```

**Barcelona**

```
=== Ingesting barcelona ===
  Listings after validation: 3,400
  Embedding listings: 34/34 batches (~19s)
  Inserting 3,400 listings...
  Reviews to ingest: 15,802
  Calendar rows: 309,400

=== Database stats (final) ===
  Listings:  11,850 (11,850 with embeddings)
  Reviews:   56,007
  Calendar:  1,078,350
    barcelona: 3,400
    lisbon: 8,450
```

---

## Verification (Supabase SQL editor)

Run after ingest:

```sql
SELECT city, COUNT(*) AS listings FROM listings GROUP BY city ORDER BY city;
SELECT COUNT(*) AS total_listings FROM listings;
SELECT COUNT(*) AS with_embeddings FROM listings WHERE embedding IS NOT NULL;
SELECT COUNT(*) AS total_reviews FROM reviews;
SELECT COUNT(*) AS total_calendar FROM calendar;
```

**Expected (2026-06-28):**

| Metric | Expected |
| :--- | ---: |
| Lisbon listings | 8,450 |
| Barcelona listings | 3,400 |
| Total listings | 11,850 |
| With embeddings | 11,850 |
| Reviews | 56,007 |
| Calendar rows | 1,078,350 |

---

## Next steps

### 1. Railway (API) — ✅ done

Live: https://travel-ai-app-production-bc05.up.railway.app  
Use **Session pooler** `DATABASE_URL` on Railway (see fix log above).

### 2. Vercel (frontend) — **current**

1. Import repo → Root Directory: `frontend`.
2. `NEXT_PUBLIC_API_URL` = `https://travel-ai-app-production-bc05.up.railway.app` (no trailing slash).
3. Deploy → add Vercel URL to Railway `CORS_ORIGINS`.

### 3. Production smoke test

See [DEPLOY.md](../DEPLOY.md) §4 and [EVAL.md](../EVAL.md) golden queries.

---

## Troubleshooting notes

| Issue | Fix |
| :--- | :--- |
| `python: command not found` | `cd ingestion && source .venv/bin/activate` before running script |
| Connection refused / auth failed | URL-encode `%` in password; use direct port 5432 |
| Healthcheck failure after deploy | Dockerfile must bind `${PORT:-8000}` (Railway injects `PORT`) |
| Public 502 but Deploy Logs show `/health` 200 | Set Networking **target port** to Deploy Log port (e.g. **8080**) |
| Build failed: Dockerfile not found | Use repo root deploy + root `Dockerfile` (copies `backend/`) |
| Listings 500 / health `db: false` | Wrong/missing `DATABASE_URL`; encode `%` in password; try **Session pooler** URI (IPv4) |
| Chat timeout on Railway | Warm with `/health` + one chat request; use OpenAI not Ollama |
