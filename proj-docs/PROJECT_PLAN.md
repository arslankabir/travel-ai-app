# Senior Full-Stack AI Travel Platform — Development Blueprint

Single source of truth for architecture, folder structure, database limits, and
development phases. Use this document to guide all code generation in Cursor.

---

## 1. Core Tech Stack & Infrastructure

| Layer | Technology | Implementation Detail |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 14+ (App Router)** | TypeScript, React, Tailwind CSS, `shadcn/ui` for Booking-style UI. |
| **Interactive Map** | **MapLibre GL** | Open-source Mapbox fork. Free tiles (CartoDB Voyager / OSM). No API key billing. |
| **Backend** | **FastAPI (Python)** | `async/await` throughout. REST for traditional search; hybrid SSE via LangGraph `astream_events`. |
| **AI Orchestration** | **LangGraph (Python)** | State-machine graph with **conditional routing** between four specialized agents. Chosen for explicit state passing, observable steps, and conditional edges. |
| **Embeddings (fixed)** | **OpenAI `text-embedding-3-small`** | **512-dim halfvec** in both local and production. Same model + dimensions everywhere to prevent vector space mismatch. ~$0.10 for full corpus. |
| **Chat LLMs (pluggable)** | **Ollama (local dev) / OpenAI (production)** | Local: `qwen2.5:3b` (Intent/Review), `llama3.1:8b` (Itinerary). Production: `gpt-4o-mini`, `gpt-4o`. Switched via `.env` through `ModelFactory`. |
| **Database (Unified)** | **PostgreSQL + PostGIS + pgvector** | One DB for relational, geospatial, and vector queries in a single hybrid SQL statement. |
| **Local Container Env** | **Docker** | `docker-compose up` for Postgres + optional Redis. Ollama runs on the host (not in Docker). |
| **Production Cloud** | **Vercel + Railway + Supabase** | Railway over Render (fewer cold-start issues for SSE demos). Supabase free tier for hosted Postgres. |

### Why this stack (time-boxed constraint)

- **Unified Postgres** instead of Postgres + Qdrant + separate geo service: one connection, one query language, one deploy target.
- **LangGraph** over CrewAI/AutoGen: graph-based conditional routing maps directly to Intent → (Search | Review | Itinerary) paths.
- **Embeddings locked to OpenAI 512-dim**: mixing embedding providers between ingest and query breaks similarity search (different vector spaces). Fixed provider; pluggable toggle reserved for chat LLMs only.
- **Ollama for local chat dev**: saves LLM query costs during development; EVAL and deployed app must use OpenAI config.
- **MapLibre** over Mapbox: zero billing setup for map tiles.

---

## 2. Pluggable Infrastructure Configuration (`.env`)

Standardize vector settings globally. The pluggable switch is **reserved solely
for chat LLMs** to save query costs during local development.

```bash
# ==============================================================================
# DATABASE CONFIGURATION
# ==============================================================================
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/travel_db
VECTOR_DIMENSION=512  # text-embedding-3-small with dimension reduction

# ==============================================================================
# EMBEDDING CONFIGURATION (Fixed — same model in local AND production)
# ==============================================================================
# Both environments MUST use identical embedding model to prevent vector space mismatch
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=your_openai_key_here

# ==============================================================================
# CHAT LLM CONFIGURATION (Pluggable toggle for agent node execution)
# ==============================================================================
# Option A: Local chat agents (Ollama locally)
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL_INTENT=qwen2.5:3b        # Local tool-calling / structured JSON
LLM_MODEL_REVIEW=qwen2.5:3b        # Review synthesis (dev only)
LLM_MODEL_ITINERARY=llama3.1:8b    # Itinerary generation (dev only)

# Option B: Production chat agents (OpenAI Cloud)
# LLM_PROVIDER=openai
# LLM_BASE_URL=https://api.openai.com/v1
# LLM_MODEL_INTENT=gpt-4o-mini
# LLM_MODEL_REVIEW=gpt-4o-mini
# LLM_MODEL_ITINERARY=gpt-4o
```

**Critical rules:**
- Never switch embedding providers between ingest and query — vectors must share the same mathematical space.
- Run EVAL golden queries against **OpenAI production config** on the deployed app.
- Ollama does not return reliable token usage → telemetry/token counts are authoritative only under `LLM_PROVIDER=openai`.
- **Chat LLMs (Ollama) ≠ embeddings (OpenAI):** retrieval semantic search always calls OpenAI embeddings; `OPENAI_API_KEY` must be set even when `LLM_PROVIDER=ollama`.

### Local Ollama setup (Option A — chat agents only)

Ollama runs **natively on the host, not inside Docker.

```bash
# 1. Install from https://ollama.com (app starts server on :11434)

# 2. Pull models referenced in .env (one-time)
ollama pull qwen2.5:3b      # Intent + Review agents (~1.9 GB)
ollama pull llama3.1:8b     # Itinerary agent (~4.9 GB)

# 3. Verify
curl http://localhost:11434/api/tags
ollama list

# 4. Confirm .env Option A is active
# LLM_PROVIDER=ollama
# LLM_BASE_URL=http://localhost:11434/v1
# OPENAI_API_KEY=...   ← still required for pgvector retrieval
```

**Without Ollama:** NL search bar uses heuristic intent parsing; Concierge review/itinerary agents fail unless you switch to Option B (`LLM_PROVIDER=openai`).

---

## 3. Data Source Strategy

### Choice: Inside Airbnb (real data, Option A)

**Cities:** Lisbon + Amsterdam (or Lisbon + Porto). Both exceed 50K listings / 200K reviews combined.

**Golden-query note:** Dubai itinerary examples cannot be served on Inside Airbnb data. Demo itinerary planning on Lisbon/Amsterdam in EVAL.md; document as a data-source constraint.

### Real-data field reality (plan around this early)

| Field | Source | Plan |
| :--- | :--- | :--- |
| Per-review rating | **Not in `reviews.csv`** | Filter reviews by **topic/sentiment** (derived), not per-review score. Listing-level aspect scores come from `listings.csv` columns. |
| Review language | **Not in `reviews.csv`** | Detect at ingest with `langdetect`; store `language` column. |
| Review topics | **Not available** | Tag at ingest via keyword/heuristic buckets (cleanliness, location, noise, value, staff). |
| Aspect scores (detail page) | **`listings.csv`** | Use `review_scores_cleanliness`, `_location`, `_value`, `_communication`, `_checkin` directly — no LLM needed. |
| Photo gallery | **Single `picture_url`** | Primary photo from CSV; supplement with deterministic placeholder gallery (Picsum/Unsplash by listing id). Document in README. |
| Guest selector | **`accommodates`, `bedrooms`, `beds`** | Map adults → `accommodates`, rooms → `bedrooms`. Children filter is soft (document mapping). |

---

## 4. Workspace File Structure

```
/travel-ai-app
  ├── docker-compose.yml          # Postgres + PostGIS + pgvector (+ optional Redis)
  ├── init-extensions.sql         # Enable PostGIS, pgvector halfvec(512), create tables + indexes
  ├── .env.example                # Pluggable LLM + fixed embedding config template
  ├── README.md                   # Architecture Mermaid diagram, one-command run, trade-offs, cost/query
  ├── EVAL.md                     # Golden queries + manual scoring rubric (OpenAI config)
  ├── PROJECT_PLAN.md             # This blueprint
  │
  ├── /ingestion                  # Standalone ETL (local only, re-runnable)
  │    ├── /raw_data              # Inside Airbnb CSV downloads (.gitignored)
  │    ├── /scripts
  │    │    ├── ingest.py         # Main pipeline: Category A clean + Category B enrich + embed + load
  │    │    ├── enrich_reviews.py # Language detect, topic tags, per-property summary (deploy slice)
  │    │    └── ingest.py --limit  # Export downsampled slice for Supabase upload
  │    └── requirements.txt
  │
  ├── /backend
  │    ├── /app
  │    │    ├── /db
  │    │    │    ├── connection.py
  │    │    │    └── models.py
  │    │    ├── /agents
  │    │    │    ├── factory.py   # ModelFactory: pluggable chat LLMs, fixed OpenAI embeddings
  │    │    │    ├── state.py     # LangGraph TypedDict state
  │    │    │    ├── graph.py     # Graph + conditional router edges
  │    │    │    ├── telemetry.py # Token usage, latency, step trace → persisted for /api/trace
  │    │    │    └── /nodes
  │    │    │         ├── intent.py
  │    │    │         ├── retrieval.py
  │    │    │         ├── review.py
  │    │    │         ├── itinerary.py
  │    │    │         └── router.py
  │    │    ├── /routers
  │    │    │    ├── listings.py  # Search, filter, sort, bbox, pagination
  │    │    │    ├── chat.py      # Hybrid SSE: astream_events + structured metadata payloads
  │    │    │    ├── batch.py     # asyncio.gather parallel compare/summarize
  │    │    │    └── trace.py     # GET /api/trace/{request_id}
  │    │    ├── /cache
  │    │    │    └── redis_cache.py
  │    │    └── main.py
  │    └── requirements.txt
  │
  └── /frontend
       ├── /src
       │    ├── /app
       │    │    ├── page.tsx
       │    │    ├── /property/[id]/page.tsx
       │    │    ├── /compare/page.tsx
       │    │    └── /booking/confirm/page.tsx
       │    ├── /components
       │    │    ├── /ui
       │    │    ├── MapView.tsx
       │    │    ├── ListingList.tsx
       │    │    ├── FilterBar.tsx
       │    │    ├── NaturalLanguageBar.tsx
       │    │    ├── ChatConsole.tsx
       │    │    ├── WishlistButton.tsx
       │    │    └── CompareMatrix.tsx
       │    └── /lib
       │         ├── sse.ts       # Parses hybrid SSE events (token + structured metadata)
       │         ├── wishlist.ts
       │         └── api.ts
       └── package.json
```

---

## 5. Database & Scale Strategy

### A. Local development (full scale)

| Metric | Target |
| :--- | :--- |
| Listings | 50,000+ across 2 cities |
| Reviews | 200,000+ |
| Calendar | **Next 90 days only** (not full 365 × listings ≈ 18M rows) |
| Vector column | `halfvec(512)` — pgvector HNSW index |

**Ingestion memory:** Pandas `chunksize` reads, batched OpenAI embedding calls (100/batch), PostgreSQL `COPY` bulk inserts — never row-by-row.

**Indexes:**
- GIST on `geometry` (PostGIS bounding-box queries)
- HNSW on `embedding` (pgvector ANN, halfvec 512)
- B-tree on `listing_id`, `price`, `city`, `calendar.date`

### B. Production (Supabase free tier, ~500 MB)

| Metric | Target | Rationale |
| :--- | :--- | :--- |
| Listings | **~10,000–15,000** (one full city slice) | Large enough to demo map clustering + ANN at scale |
| Reviews | ~30,000–50,000 | Proportional to listings |
| Calendar | 90 days | Same window as local |
| Embeddings | **512-dim halfvec** | Same schema as local; no re-embedding needed on deploy |

**README must document:** local = full 50K+ proof of pipeline; deployed = engineered slice for free-tier limits.

---

## 6. Ingestion & Enrichment Pipeline

Re-runnable script: `ingestion/scripts/ingest.py`

Ingestion is divided into two categories to preserve speed, determinism, and
vector consistency.

### Category A: Basic Data Cleaning (deterministic — zero LLM)

Handled entirely with Python, Pandas, and stdlib. Target: < 10 seconds for
validation passes over the full dataset.

- **Currency parsing:** Strip `$`, `€`; cast price strings to `float`.
- **Coordinate verification:** Drop null lat/lng; cast to float for PostGIS.
- **Availability window:** Parse date strings; keep **next 90 days only**; index `(listing_id, date)`.
- **Neighbourhood price percentile:** Pandas groupby percentile (0.0–1.0) — Enrichment #1.
- **Amenity normalization:** Deterministic string map → JSON `["wifi","pool",...]` — Enrichment #2.
- **Listing aspect scores:** Passthrough `review_scores_*` columns from `listings.csv`.
- **Review language + topic tags:** `langdetect` + keyword heuristics — Enrichment #3.

### Category B: High-Value Text Enrichments (AI — offline only)

Run before DB load to minimize runtime API dependency.

- **Listing vectorization:** `ModelFactory.get_embeddings()` → OpenAI `text-embedding-3-small`, `dimensions=512`. ~50K listings, ~$0.10 total. **Do NOT embed 200K reviews.**
- **Precomputed review summaries:** Group reviews per listing; run through selected chat model (Ollama locally or gpt-4o-mini in production) for deploy slice (~10K listings). Store in `listing_review_summaries` — Enrichment #4.

```
[Inside Airbnb CSVs — Lisbon + Amsterdam]
         │
         ▼
[Category A: Pandas chunked load & validation]
         │
         ├──► Currency parse · coordinate verify · 90-day calendar
         ├──► Price percentile · amenity normalize · aspect passthrough
         └──► Review language + topic tags (langdetect + heuristics)
         │
         ▼
[Category B: AI enrichments — offline]
         │
         ├──► Listing embeddings via ModelFactory (OpenAI 512-dim ONLY)
         └──► Review summaries for deploy slice (pluggable chat LLM)
         │
         ▼
[Postgres bulk COPY insert] ──► halfvec(512) · PostGIS geometry · HNSW index
         │
         ▼
[ingest.py --limit] ──► Supabase upload slice (~10–15K listings)
```

---

## 7. Model Factory (`/backend/app/agents/factory.py`)

Abstracts chat LLM initialization. Embeddings are **always** OpenAI 512-dim.
LangGraph nodes call `ModelFactory.get_llm(role)` — they never import providers directly.

```python
import os
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

class ModelFactory:
    @staticmethod
    def get_llm(role: str = "intent", temperature: float = 0.0):
        provider = os.getenv("LLM_PROVIDER", "ollama").lower()
        base_url = os.getenv("LLM_BASE_URL")

        role_key = {
            "intent": "LLM_MODEL_INTENT",
            "review": "LLM_MODEL_REVIEW",
            "itinerary": "LLM_MODEL_ITINERARY",
        }.get(role, "LLM_MODEL_INTENT")

        model_name = os.getenv(role_key, "qwen2.5:3b")

        if provider == "ollama":
            return ChatOpenAI(
                base_url=base_url,
                api_key="ollama-local",
                model=model_name,
                temperature=temperature,
            )
        elif provider == "openai":
            return ChatOpenAI(model=model_name, temperature=temperature)
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")

    @staticmethod
    def get_embeddings():
        # ALWAYS OpenAI 512-dim — never pluggable
        return OpenAIEmbeddings(
            model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
            dimensions=int(os.getenv("VECTOR_DIMENSION", "512")),
        )
```

**Ollama dev caveat:** `qwen2.5:3b` may produce malformed JSON for Intent agent structured output. Use JSON mode + validation/repair. Itinerary quality on `llama3.1:8b` is below `gpt-4o` — acceptable for dev, not for EVAL scoring.

---

## 8. Agent Orchestration (LangGraph)

### Two AI entry points (same Intent agent, different UI)

| Entry | Location | Behavior |
| :--- | :--- | :--- |
| **Natural language search bar** | Top of results page | Parses query → structured filters → **updates filter chips visibly** → triggers search |
| **Multi-agent concierge** | Floating panel, accessible anywhere | Full conversational flow with streaming steps, citations, itinerary cards |

Both POST to `/api/chat/stream` with `{ user_input, mode: "search" | "concierge" }`.

### Conditional routing (not a linear chain)

```
                    ┌──────────────────────┐
                    │ User Query + Mode    │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │    Intent Agent      │ ──► Structured JSON + intent_type
                    └──────────┬───────────┘     SSE: filters_parsed event
                               ▼
                    ┌──────────────────────┐
                    │    Router Node       │
                    └──────────┬───────────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        search_only      review_compare    itinerary_plan
              │                │                │
              ▼                ▼                ▼
         Retrieval         Retrieval         Retrieval
              │                ▼                ▼
           [END]           Review            Review
                              │                ▼
                           [END]           Itinerary
                                              │
                                           [END]
```

**Intent types:**
- `search_only` — "quiet 1-bed in Lisbon under €130" → Intent → Retrieval → END
- `review_compare` — "...most consistent reviews?" → Intent → Retrieval → Review → END
- `itinerary_plan` — "4-night trip..." → Intent → Retrieval → Review → Itinerary → END

### Agent responsibilities

| Agent | Model (via ModelFactory) | Input | Output |
| :--- | :--- | :--- | :--- |
| **Intent** | `LLM_MODEL_INTENT` | Raw NL query + mode | `{city, dates, budget, guests, amenities, vibe, intent_type, parsed_filters}` |
| **Retrieval** | SQL + OpenAI embeddings | Structured filters | Top 5–10 listings with rationale (price percentile, distance, semantic score) |
| **Review** | `LLM_MODEL_REVIEW` | Listing IDs + fetched reviews (relational) | Synthesized comparison with validated `review_id` citations |
| **Itinerary** | `LLM_MODEL_ITINERARY` | Selected stays + constraints | Day-by-day cards, total cost, swap-out options |

### Failure handling & retries

- Per-node timeout (30s Intent/Review, 60s Itinerary)
- LLM retry: 2 attempts with exponential backoff on rate limit / 5xx
- Partial results: if Review fails, return retrieval results + error event
- SSE emits `{"event":"error", "node":"review", "message":"...", "recoverable":true}`

### Hallucination control (Review agent)

1. Fetch reviews where `listing_id IN (...)` — bounded context
2. Structured output: `{summary, citations: [{review_id, quote, listing_id}]}`
3. Post-validate: every `review_id` must exist in fetched set
4. Frontend: citations navigate to `/property/[id]#review-[review_id]`

---

## 9. Hybrid Structured SSE Router (`/backend/app/routers/chat.py`)

Uses LangGraph `astream_events` for live token streaming **and** intercepts
node outputs for structured metadata (filter sync, citations, trace). Does not
rely on raw tokens alone.

```python
import json
import uuid
import time
from pydantic import BaseModel
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.agents.graph import app_graph
from app.agents.telemetry import TraceStore

router = APIRouter()
trace_store = TraceStore()  # In-memory or Redis, TTL 1hr

class ChatRequest(BaseModel):
    user_input: str
    mode: str = "concierge"  # "search" | "concierge"

@router.post("/api/chat/stream")
async def stream_chat(req: ChatRequest):
    async def event_generator():
        request_id = str(uuid.uuid4())
        start_time = time.time()
        trace = trace_store.create(request_id)

        yield f"data: {json.dumps({'event': 'trace_init', 'request_id': request_id})}\n\n"

        initial_state = {
            "messages": [("user", req.user_input)],
            "mode": req.mode,
            "request_id": request_id,
        }

        async for event in app_graph.astream_events(initial_state, version="v2"):
            kind = event.get("event")

            # 1. Node transitions (agent telemetry)
            if kind == "on_chat_model_start":
                node_name = event.get("metadata", {}).get("langgraph_node", "agent")
                trace.start_step(node_name)
                yield f"data: {json.dumps({'event': 'node_start', 'node': node_name})}\n\n"

            # 2. Raw stream tokens for chat UI
            elif kind == "on_chat_model_stream":
                content = event.get("data", {}).get("chunk", {}).content
                if content:
                    yield f"data: {json.dumps({'event': 'token', 'token': content})}\n\n"

            # 3. Token usage (OpenAI only — Ollama may omit)
            elif kind == "on_chat_model_end":
                node_name = event.get("metadata", {}).get("langgraph_node", "agent")
                usage = event.get("data", {}).get("output", {}).usage_metadata
                if usage:
                    trace.record_tokens(node_name, usage)

            # 4. Structured metadata from completed nodes
            elif kind == "on_chain_end":
                node_name = event.get("metadata", {}).get("langgraph_node")
                output_data = event.get("data", {}).get("output", {})

                if node_name == "intent_agent" and "parsed_filters" in output_data:
                    yield f"data: {json.dumps({'event': 'filters_parsed', 'filters': output_data['parsed_filters']})}\n\n"

                elif node_name == "review_agent" and "citations" in output_data:
                    yield f"data: {json.dumps({'event': 'citations_loaded', 'citations': output_data['citations']})}\n\n"

                elif event.get("name") == "LangGraph":
                    latency_ms = int((time.time() - start_time) * 1000)
                    trace.finalize(latency_ms)
                    trace_store.save(request_id, trace)
                    yield f"data: {json.dumps({'event': 'complete', 'request_id': request_id, 'latency_ms': latency_ms})}\n\n"

            # 5. Error handling (failure demo)
            elif kind == "on_chain_error":
                node_name = event.get("metadata", {}).get("langgraph_node", "unknown")
                trace.fail_step(node_name)
                trace_store.save(request_id, trace)
                yield f"data: {json.dumps({'event': 'error', 'node': node_name, 'recoverable': True})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

### SSE event schema (hybrid)

| Event | Purpose | Frontend handler |
| :--- | :--- | :--- |
| `trace_init` | Correlation ID for `/api/trace` | Store `request_id` |
| `node_start` | Agent step visibility | ChatConsole progress indicator |
| `token` | Streaming markdown text | Append to chat bubble |
| `filters_parsed` | Structured filter JSON | FilterBar chip sync + re-fetch listings |
| `citations_loaded` | Verified review citations | Render clickable citation links |
| `complete` | End of graph + latency | Close stream, enable trace lookup |
| `error` | Node failure + partial results | Show graceful fallback message |

---

## 10. Backend API Surface

### Traditional search (`/api/listings`)

**Filters:** date range (calendar availability), guests (adults → accommodates, rooms → bedrooms), price range, min rating, property type, amenities, city/neighbourhood.

**Sort:** price asc/desc, rating desc, popularity (`number_of_reviews` desc), distance asc.

**Map sync:** `bbox` query param; GeoJSON-friendly marker payload with price labels.

**Pagination:** offset/limit (default 20).

### Observability (`/api/trace/{request_id}`) — **required by brief**

Populated by `TraceStore` during SSE stream (not reconstructed after the fact).

```json
{
  "request_id": "...",
  "total_latency_ms": 4200,
  "token_usage": {"intent": 450, "review": 1200, "itinerary": 800, "total": 2450},
  "agent_steps": [
    {"node": "intent_agent", "latency_ms": 800, "status": "ok"},
    {"node": "retrieval_agent", "latency_ms": 120, "status": "ok", "results_count": 8},
    {"node": "review_agent", "latency_ms": 2100, "status": "ok"}
  ]
}
```

Store in-memory dict or Redis keyed by `request_id`, TTL 1 hour.

### Batch (`/api/batch/compare`)

Input: `{listing_ids: [id1, id2, ...]}` (2–5 listings).

Implementation: **`asyncio.gather`** concurrent calls via `ModelFactory.get_llm("review")` — NOT OpenAI Batch API.

Also: `/api/batch/summarize` — parallel review summaries for up to 20 listing IDs.

### Caching

| Key pattern | TTL | What |
| :--- | :--- | :--- |
| `search:{hash(filters)}` | 5 min | Listing search results |
| `summary:{listing_id}` | 24 hr | Precomputed or on-demand review summary |
| `compare:{sorted_ids}` | 1 hr | Batch compare result |

Use Redis if in docker-compose; fallback to `functools.lru_cache` for local dev only.

---

## 11. Frontend Product Surface Checklist

### Search & results
- [ ] Date range picker with calendar availability awareness
- [ ] Guest selector (adults, children soft, rooms)
- [ ] Price slider, rating filter, property type, amenities multi-select
- [ ] Sort dropdown (price, rating, popularity, distance)
- [ ] List view cards: photo, name, price/night, total stay, rating, key amenities, distance
- [ ] Map view: MapLibre markers with price, clustering, list↔map hover sync
- [ ] Pagination
- [ ] **Natural language search bar** at top of results (filter chips update via `filters_parsed` SSE event)

### Property detail
- [ ] Photo gallery (primary + placeholders)
- [ ] Amenities grid
- [ ] Embedded neighbourhood map
- [ ] Reviews: filter by language, topic; listing-level aspect scores; AI summary at top
- [ ] Availability calendar (90-day window)
- [ ] Price breakdown (nights × rate + mocked taxes/fees)
- [ ] Mock Reserve → confirmation screen

### Saved / compare
- [ ] Wishlist via `localStorage` (no auth)
- [ ] Compare 2–4 listings: price, amenities, AI verdict

### Concierge
- [ ] Global chat panel with hybrid SSE streaming (`token` + `node_start` events)
- [ ] Visible agent step progress
- [ ] Citations click through to listing/review (via `citations_loaded` event)

---

## 12. Phase-by-Phase Time-boxed Flow

### Phase 1: Database & Ingestion (Hours 0–8)

1. `docker compose up -d` — Postgres + PostGIS + pgvector
2. Run `init-extensions.sql` — tables, `halfvec(512)`, HNSW index
3. Create `.env` with fixed embedding config + local Ollama chat settings
4. Download Inside Airbnb: Lisbon + Amsterdam
5. Build `ingest.py` — Category A deterministic clean + Category B OpenAI embeddings
6. Calendar: 90-day window only
7. **Milestone:** Local DB has 50K+ listings, 200K+ reviews; hybrid query < 50ms

### Phase 2: Core Search & Map (Hours 8–18)

1. Scaffold Next.js + FastAPI + `ModelFactory`
2. Split-screen: list left, map right
3. All traditional filters + sort + bbox endpoint
4. Map/list hover sync, marker clustering
5. Guest selector wired to `accommodates` / `bedrooms`

### Phase 3: AI Layer (Hours 18–32)

0. **Local Ollama setup (Option A)** — install Ollama natively; `ollama pull qwen2.5:3b` + `ollama pull llama3.1:8b`; verify `curl http://localhost:11434/api/tags`. Keep `OPENAI_API_KEY` set (embeddings/retrieval still use OpenAI).
1. LangGraph nodes + router with conditional edges (all nodes use `ModelFactory`)
2. Hybrid SSE `/api/chat/stream` — `astream_events` + structured metadata + `TraceStore`
3. Natural language search bar + global concierge panel (both pass `mode`)
4. Review agent: relational fetch + citation validation
5. `/api/trace/{request_id}` reads from persisted `TraceStore`
6. Retries, timeouts, partial-result error handling
7. Switch to OpenAI config; smoke-test golden queries before Phase 4

### Phase 4: Detail, Compare, Polish (Hours 32–40)

1. Property detail page (gallery, reviews, aspects, calendar, reserve mock)
2. Compare matrix + `/api/batch/compare`
3. Wishlist (localStorage)
4. Redis/in-memory caching for search + summaries
5. UI polish — Booking/Airbnb density, not generic Bootstrap

### Phase 5: Deploy & Eval (Hours 40–48)

1. Set `.env` to OpenAI production config on Railway
2. Supabase: upload ~10–15K listing slice via ingest with `--limit`
3. Deploy FastAPI → Railway; Next.js → Vercel; env vars connected
4. Warm Railway before demos (avoid cold-start SSE failure)
5. Write `EVAL.md` — golden queries scored on **OpenAI production config**
6. Write `README.md` — Mermaid diagram, one-command run, trade-offs, cost/query
7. Run production smoke tests: filter search, NL search, concierge, failure case

---

## 13. Deliverables Checklist

| Deliverable | Location | Status |
| :--- | :--- | :--- |
| Public GitHub repo | — | |
| One-command local run | `docker-compose.yml` + README | |
| Architecture diagram (Mermaid) | README.md | |
| `.env.example` | root | Pluggable LLM + fixed embedding template |
| Data choice + why | README.md | Inside Airbnb, Lisbon + Amsterdam |
| Key trade-offs | README.md | See §15 |
| Cost per user query | README.md | See §14 |
| Live deployed URL | Railway + Vercel + Supabase | |
| EVAL.md | `/EVAL.md` | Golden queries on OpenAI config |

---

## 14. Cost-Per-Query Estimate (back-of-envelope)

| Query type | Tokens (approx) | Cost (OpenAI prod) |
| :--- | :--- | :--- |
| NL search only (Intent + Retrieval) | ~800 in + 200 out (mini) | ~$0.0002 |
| Search + review compare | ~3K in + 800 out (mini) | ~$0.001 |
| Full itinerary | ~5K in + 2K out (4o) | ~$0.03 |
| Embedding (per semantic query) | ~100 tokens | ~$0.000002 |

At 1,000 queries/day (80% search, 15% review, 5% itinerary): **~$2–3/day**.

**One-time ingest:** ~$0.10 embeddings (OpenAI 512-dim) + ~$2 precomputed summaries for deploy slice.

**Local dev savings:** Ollama chat agents = $0 LLM cost during development (embeddings still ~$0.10 one-time via OpenAI).

---

## 15. Explicit Trade-offs (document in README)

1. **Local 50K+ / deployed ~10–15K** — free-tier storage; full pipeline proven locally
2. **Embeddings fixed to OpenAI 512-dim** — never pluggable; prevents vector space mismatch
3. **Chat LLMs pluggable (Ollama dev / OpenAI prod)** — EVAL and deployed app use OpenAI only
4. **Listing embeddings only** — Review agent uses relational fetch; no 200K review vectors
5. **90-day calendar window** — avoids 18M+ calendar rows
6. **Single photo + placeholders** — Inside Airbnb provides one URL per listing
7. **Review filter by topic/language, not per-review score** — not in source data
8. **No Dubai** — golden query adapted to Lisbon/Amsterdam in demo
9. **Wishlist in localStorage** — no auth per brief scope
10. **Ollama token telemetry unreliable** — authoritative token counts only under OpenAI config

---

## 16. LangGraph choice (README snippet, 3–5 lines)

> We use LangGraph because four specialized agents with
> conditional routing (search vs. review-deep-dive vs. itinerary), observable
> intermediate steps over SSE, and structured state passing between nodes.
> LangGraph's conditional edges, TypedDict state, and native `astream_events`
> API map directly to our hybrid streaming requirements (live tokens + structured
> filter/citation payloads). CrewAI adds orchestration overhead; a raw function-calling
> loop lacks explicit graph visibility for the step-trace requirement.
