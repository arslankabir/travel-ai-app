# Deployment guide

Deploy the **API on Railway**, **frontend on Vercel**, and **Postgres on Supabase** (or Railway Postgres with PostGIS extension if available).

## 1. Database (Supabase recommended)

1. Create a Supabase project.
2. Enable extensions in SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Run `init-extensions.sql` from the repo (tables + indexes).
4. Load a **slice** (~10–15K listings) from local DB or re-run ingest with `--limit` against Supabase `DATABASE_URL`.
5. Copy connection string → `DATABASE_URL` for Railway.

**Note:** Full 50K + embeddings may exceed free tier; a Lisbon+Barcelona slice is enough for demo.

## 2. Backend (Railway)

1. New project → **Deploy from GitHub** → this repo.
2. Railway reads `railway.toml` → builds `backend/Dockerfile` (context: `backend/`).
3. Set environment variables:

   | Variable | Example |
   | :--- | :--- |
   | `DATABASE_URL` | `postgresql://...` |
   | `OPENAI_API_KEY` | `sk-...` |
   | `LLM_PROVIDER` | `openai` |
   | `LLM_BASE_URL` | `https://api.openai.com/v1` |
   | `LLM_MODEL_INTENT` | `gpt-4o-mini` |
   | `LLM_MODEL_REVIEW` | `gpt-4o-mini` |
   | `LLM_MODEL_ITINERARY` | `gpt-4o` |
   | `CORS_ORIGINS` | `https://your-app.vercel.app` |
   | `EMBEDDING_MODEL` | `text-embedding-3-small` |
   | `VECTOR_DIMENSION` | `512` |

4. Deploy → note public URL (e.g. `https://travel-ai-api.up.railway.app`).
5. Verify: `curl https://.../health`

**Build command (if not using Dockerfile):**
```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## 3. Frontend (Vercel)

1. Import repo → set **Root Directory** to `frontend`.
2. Environment variable:
   - `NEXT_PUBLIC_API_URL` = Railway API URL (no trailing slash)
3. Deploy → `https://your-app.vercel.app`

## 4. Post-deploy smoke test

```bash
curl "https://API/api/listings?city=lisbon&limit=3"
curl -N -X POST "https://API/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"user_input":"pool in Barcelona under 200","mode":"search"}'
```

**Tip:** Warm the API before a live demo (health check + one chat request) to avoid cold-start SSE timeouts.

## Troubleshooting

| Issue | Fix |
| :--- | :--- |
| CORS errors | Add exact Vercel URL to `CORS_ORIGINS` |
| 0 listings | DB slice not loaded or wrong `DATABASE_URL` |
| Chat timeout | Use OpenAI on Railway; Ollama is local-only |
| pgvector missing | Run extension SQL on Supabase |
