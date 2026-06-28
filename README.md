# Travel AI Platform

AI-native travel discovery and booking — Full Stack AI Developer assignment.

## Quick start (Phase 1 — local data)

Requires [OrbStack](https://orbstack.dev/) (or Docker) and Python 3.11+.

```bash
# 1. Start Postgres + PostGIS + pgvector + Redis
docker compose up -d

# 2. Configure environment
cp .env.example .env
# Edit .env and set OPENAI_API_KEY (required for listing embeddings)

# 3. Download Inside Airbnb data
# Lisbon + Amsterdam from https://insideairbnb.com/get-the-data/
# Place files in:
#   ingestion/raw_data/lisbon/listings.csv.gz
#   ingestion/raw_data/lisbon/reviews.csv.gz
#   ingestion/raw_data/lisbon/calendar.csv.gz
#   ingestion/raw_data/amsterdam/  (same three files)

# 4. Run ingestion
cd ingestion
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/ingest.py

# Quick smoke test (100 listings, no embeddings):
python scripts/ingest.py --limit 100 --skip-embeddings
```

## Verify database

```bash
docker compose exec db psql -U postgres -d travel_db -c "SELECT COUNT(*) FROM listings;"
docker compose exec db psql -U postgres -d travel_db -c "\dx"
```

## Architecture

See `proj-docs/PROJECT_PLAN.md` and `proj-docs/HL-component-diagram.md`.

## Quick start (Phase 2 — search + map)

With Phase 1 data already loaded in Postgres:

```bash
# 1. Start database (if not running)
docker compose up -d

# 2. Backend API
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend (separate terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 — split-screen listing search with MapLibre map.

**API:** `GET /api/listings` — filters (`city`, `min_price`, `max_price`, `min_rating`, `accommodates`, `bedrooms`, `amenity`, `check_in`, `check_out`, `bbox`), sort, pagination.

## Quick start (Phase 3 — AI layer)

Requires Ollama running locally for full concierge, or switch `LLM_PROVIDER=openai` in `.env`.

```bash
# Ollama (Option A — one-time model pull)
ollama pull qwen2.5:3b
ollama pull llama3.1:8b
curl http://localhost:11434/api/tags   # verify both models listed

# Restart backend after pip install (adds langgraph)
cd backend && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

cd frontend && npm run dev
```

**Note:** `OPENAI_API_KEY` in root `.env` is still required — retrieval uses OpenAI embeddings even when chat runs on Ollama.

**Features:**
- **Natural language search bar** — parses query → filter chips → refreshes listings (`POST /api/chat/stream` mode=`search`)
- **AI Concierge** (floating panel) — LangGraph agents: Intent → Retrieval → Review → Itinerary (`mode=concierge`)
- **Hybrid SSE** — `filters_parsed`, `citations_loaded`, `token`, `node_start`, `complete`, `error`
- **Trace** — `GET /api/trace/{request_id}` (token usage, agent steps, latency)

**Why LangGraph:** conditional routing by intent type, observable node steps for SSE, and clean state passing between specialized agents.

NL search falls back to heuristic parsing if Ollama is offline; concierge review/itinerary need a running LLM.

## Local stack

| Service | URL |
| :--- | :--- |
| PostgreSQL | `localhost:5432` |
| FastAPI | `http://localhost:8000` |
| Next.js | `http://localhost:3000` |
| Redis | `localhost:6379` |
| Ollama (chat dev) | `localhost:11434` — run natively, not in Docker |
