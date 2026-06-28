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
| Railway API deployed | 🟡 | Domain live but **502** — verify Root Directory + env vars (see below) |
| Vercel frontend deployed | ⬜ | |
| Production smoke test | ⬜ | filter, NL search, concierge, failure case |
| Live URL in README / submission | ⬜ | API: `https://travel-ai-app-production-bc05.up.railway.app` |

---

## Railway (API)

- **Project:** `giving-quietude` · service: `travel-ai-app`
- **Public URL:** https://travel-ai-app-production-bc05.up.railway.app
- **Deploy status:** App healthy internally (`GET /health` 200 on port **8080**) · public URL still **502** → fix Networking port (below)

### Fix public 502 (app runs, edge can't reach it)

Deploy logs show:
```
Uvicorn running on http://0.0.0.0:8080
100.64.0.2 - "GET /health HTTP/1.1" 200 OK
```

The container is fine. Railway's **public domain is routing to the wrong port** (often 8000 while app listens on **8080**).

**Code fix (pushed):** `backend/start.sh` forwards public port **8000 → $PORT** (8080) via socat so Railway edge routing works without UI changes.

**In Railway UI (optional):**

1. Open service **travel-ai-app** → **Settings** → **Networking**
2. Under your domain `travel-ai-app-production-bc05.up.railway.app`, find **Target port** / **Port**
3. Set it to **`8080`** (match the Deploy Log line above) — **not** 8000
4. Save → wait ~30s → retry:
   ```bash
   curl https://travel-ai-app-production-bc05.up.railway.app/health
   ```

If no port field: **Remove domain** → **Generate Domain** again (after deploy is Active).

### Required Railway settings

1. **Settings → Root Directory:** leave **empty** (repo root). Root `Dockerfile` copies `backend/`.
2. **Settings → Networking → Generate Domain** (done)
3. **Networking → Port:** must match Deploy Logs (e.g. **8080**), not 8000
4. **Variables** (must all be set):

   | Variable | Value |
   | :--- | :--- |
   | `DATABASE_URL` | Supabase URI |
   | `OPENAI_API_KEY` | Production key |
   | `LLM_PROVIDER` | `openai` |
   | `LLM_BASE_URL` | `https://api.openai.com/v1` |
   | `LLM_MODEL_INTENT` | `gpt-4o-mini` |
   | `LLM_MODEL_REVIEW` | `gpt-4o-mini` |
   | `LLM_MODEL_ITINERARY` | `gpt-4o` |
   | `EMBEDDING_MODEL` | `text-embedding-3-small` |
   | `VECTOR_DIMENSION` | `512` |
   | `CORS_ORIGINS` | `http://localhost:3000` (add Vercel URL later) |

   **Remove** `REDIS_URL=redis://localhost:6379/0` — no Redis on Railway.

4. **Redeploy** after pushing `backend/railway.toml` + PORT Dockerfile fix.

### Verify

```bash
curl https://travel-ai-app-production-bc05.up.railway.app/health
# expect: {"status":"ok"}

curl "https://travel-ai-app-production-bc05.up.railway.app/api/listings?city=lisbon&limit=3"
```

If still 502: open **Deploy Logs** — look for crash/OOM; confirm Root Directory = `backend`.

---

## Supabase connection

- **Host:** `db.unrkkzzmeumoogivclpv.supabase.co:5432`
- **Database:** `postgres` · **User:** `postgres`
- **URI pattern:** `postgresql://postgres:PASSWORD@db.unrkkzzmeumoogivclpv.supabase.co:5432/postgres`
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

### 1. Railway (API)

1. New project → Deploy from GitHub → this repo.
2. Railway reads root `Dockerfile` (copies `backend/`). **Do not** set Root Directory to `backend`.
3. Environment variables:

   | Variable | Value |
   | :--- | :--- |
   | `DATABASE_URL` | Supabase URI (same as ingest) |
   | `OPENAI_API_KEY` | Production key |
   | `LLM_PROVIDER` | `openai` |
   | `LLM_BASE_URL` | `https://api.openai.com/v1` |
   | `LLM_MODEL_INTENT` | `gpt-4o-mini` |
   | `LLM_MODEL_REVIEW` | `gpt-4o-mini` |
   | `LLM_MODEL_ITINERARY` | `gpt-4o` |
   | `CORS_ORIGINS` | `https://YOUR-APP.vercel.app` |
   | `EMBEDDING_MODEL` | `text-embedding-3-small` |
   | `VECTOR_DIMENSION` | `512` |

4. Deploy → `curl https://YOUR-RAILWAY-URL/health`
5. `curl "https://YOUR-RAILWAY-URL/api/listings?city=lisbon&limit=3"`

### 2. Vercel (frontend)

1. Import repo → Root Directory: `frontend`.
2. `NEXT_PUBLIC_API_URL` = Railway URL (no trailing slash).
3. Deploy → open app → search Lisbon.

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
| 0 listings on Railway | Wrong `DATABASE_URL` or CORS blocking frontend only |
| Chat timeout on Railway | Warm with `/health` + one chat request; use OpenAI not Ollama |
