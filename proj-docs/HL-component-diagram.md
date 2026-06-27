# High-Level Component Diagram

Architecture reference aligned with `PROJECT_PLAN.md`. All diagrams use
**Mermaid** for visual rendering in Cursor, GitHub, and Markdown previews.

**Core diagrams:** §1 Overview · §2 Deployment · §4 Ingestion · §6 Hybrid SSE
**Detail diagrams:** §3 Agent Routing · §5 Model Factory · §7 Request Flow

---

## 1. System Overview

```mermaid
flowchart TB
    subgraph FE["Frontend — Next.js (Vercel)"]
        direction TB
        Filters["Search & Filters<br/>Dates · Guests · Price · Sort"]
        NLBar["Natural Language Bar<br/>mode: search"]
        Concierge["Global Concierge Chat<br/>mode: concierge"]
        List["Listing List + Cards"]
        Map["MapView — MapLibre GL"]
        Pages["Detail · Compare · Confirm<br/>Wishlist → localStorage"]

        Filters <-->|hover sync| List
        Filters <-->|hover sync| Map
        NLBar -->|filters_parsed event| Filters
        List --> Pages
    end

    subgraph BE["Backend — FastAPI (Railway)"]
        direction TB
        REST["REST API<br/>/listings · /batch/* · /trace/request_id"]
        SSE["Hybrid SSE<br/>/api/chat/stream<br/>astream_events + structured metadata"]
        Cache["Cache — Redis / LRU"]
        TraceStore["TraceStore<br/>tokens · latency · steps<br/>persisted for GET /trace"]

        Factory["ModelFactory<br/>Pluggable chat LLMs<br/>Fixed OpenAI embeddings 512-dim"]

        subgraph LG["LangGraph — Conditional Routing"]
            Intent["Intent Agent"]
            Router{"Router Node"}
            Retrieval["Retrieval Agent<br/>Hybrid SQL + vector"]
            Review["Review Agent<br/>citations validated"]
            Itinerary["Itinerary Agent"]
            EndSearch([END])
            EndReview([END])
            EndTrip([END])

            Intent --> Router
            Router -->|search_only| Retrieval
            Router -->|review_compare| Retrieval
            Router -->|itinerary_plan| Retrieval
            Retrieval -->|search_only| EndSearch
            Retrieval --> Review
            Review -->|review_compare| EndReview
            Review --> Itinerary
            Itinerary --> EndTrip
        end

        Factory --> LG
        REST --> Cache
        SSE --> LG
        LG --> TraceStore
        SSE --> TraceStore
        Cache -->|miss| LG
    end

    subgraph DATA["Data Layer — PostgreSQL + PostGIS + pgvector"]
        PG[("Unified Postgres<br/>halfvec 512 · HNSW<br/>Local 50K+ / Deploy ~15K")]
        Ingest["Offline Ingestion<br/>Category A clean + Category B enrich"]
        Ingest --> PG
    end

    subgraph EXT["External Services"]
        OpenAI["OpenAI API<br/>embeddings ALWAYS<br/>chat LLMs in production"]
        Ollama["Ollama — local dev only<br/>qwen2.5:3b · llama3.1:8b<br/>M4 GPU · not in Docker"]
    end

    FE -->|REST| REST
    FE -->|SSE| SSE
    NLBar --> SSE
    Concierge --> SSE
    REST --> PG
    LG --> PG
    Factory -->|embeddings always| OpenAI
    Factory -->|chat dev| Ollama
    Factory -->|chat prod| OpenAI
    Ingest -->|embeddings always| OpenAI
    Ingest -->|summaries dev/prod| Ollama
    Ingest -->|summaries prod| OpenAI
```

---

## 2. Deployment Topology

```mermaid
flowchart LR
    User(["Evaluator / User"]) --> Vercel["Vercel<br/>Next.js Frontend"]
    Vercel -->|HTTPS REST + SSE| Railway["Railway<br/>FastAPI · OpenAI config"]
    Railway --> Supabase["Supabase<br/>Postgres · halfvec 512"]
    Railway --> OpenAI["OpenAI API<br/>embeddings + chat LLMs"]

    subgraph LocalDev["Local Dev — M4 Pro"]
        Docker["Docker<br/>Postgres + Redis"]
        Ollama["Ollama<br/>chat LLMs only"]
        IngestLocal["Ingestion Pipeline<br/>50K+ listings"]
        IngestLocal -->|OpenAI embeddings| OpenAI
        IngestLocal --> Docker
        IngestLocal -->|export_deploy.py| Supabase
    end

    style User fill:#e8f4fc
    style Vercel fill:#f0f0f0
    style Railway fill:#f0f0f0
    style Supabase fill:#d4edda
    style OpenAI fill:#fff3cd
    style Ollama fill:#fde8e8
    style LocalDev fill:#f5f5f5
```

---

## 3. LangGraph Agent Routing (Detail)

```mermaid
flowchart TD
    Query(["POST /api/chat/stream<br/>user_input + mode"]) --> Intent

    Intent["Intent Agent<br/>ModelFactory.get_llm intent<br/>→ parsed_filters + intent_type"]
    Intent -->|SSE: filters_parsed| Router

    Router{"Router Node<br/>intent_type?"}

    Router -->|search_only| R1["Retrieval Agent<br/>Hybrid SQL + OpenAI 512-dim vector"]
    Router -->|review_compare| R2["Retrieval Agent"]
    Router -->|itinerary_plan| R3["Retrieval Agent"]

    R1 --> E1([END])
    R2 --> Rev1["Review Agent<br/>ModelFactory.get_llm review<br/>relational fetch + citations"]
    R3 --> Rev2["Review Agent"]

    Rev1 --> E2([END])
    Rev2 --> Itin["Itinerary Agent<br/>ModelFactory.get_llm itinerary"]
    Itin --> E3([END])

    Intent -.->|timeout / retry ×2| Err["SSE: event error<br/>partial results"]
    Rev1 -.->|timeout| Err
    Itin -.->|timeout| Err

    TraceStore["TraceStore.save<br/>GET /api/trace/request_id"] -.-> Intent
    TraceStore -.-> R1
    TraceStore -.-> Rev1
    TraceStore -.-> Itin
```

---

## 4. Ingestion Pipeline (Category A + B)

```mermaid
flowchart TD
    Raw["Inside Airbnb CSVs<br/>Lisbon + Amsterdam"] --> CatA

    subgraph CatA["Category A — Deterministic · Zero LLM"]
        Validate["Pandas chunked load<br/>Currency parse · coord verify"]
        Cal["90-day calendar window"]
        E1["Price percentile · amenity normalize"]
        E3["Review language + topic tags<br/>langdetect + heuristics"]
        Validate --> Cal --> E1 --> E3
    end

    subgraph CatB["Category B — AI Enrichments · Offline Only"]
        Embed["Listing embeddings<br/>ModelFactory.get_embeddings<br/>OpenAI text-embedding-3-small · 512-dim<br/>SAME vector space as live queries"]
        E4["Review summaries — deploy slice<br/>Pluggable chat LLM<br/>Ollama local · gpt-4o-mini prod"]
    end

    CatA --> CatB
    Embed --> Load["Postgres bulk COPY<br/>halfvec 512 · PostGIS · HNSW"]
    E4 --> Load

    Load --> LocalDB[("Local DB<br/>50K+ listings · 200K+ reviews")]
    Load --> Export["export_deploy.py"]
    Export --> SupaDB[("Supabase<br/>~10–15K slice")]

    OpenAIEmb["OpenAI Embeddings API<br/>ALWAYS — not pluggable"] --> Embed
```

---

## 5. Pluggable Model Factory

```mermaid
flowchart LR
    subgraph Env[".env Configuration"]
        VecFixed["VECTOR_DIMENSION=512<br/>EMBEDDING_PROVIDER=openai<br/>FIXED — never toggle"]
        LLMToggle["LLM_PROVIDER<br/>ollama · local dev<br/>openai · production"]
    end

    subgraph Factory["ModelFactory"]
        GetLLM["get_llm role<br/>intent · review · itinerary"]
        GetEmb["get_embeddings<br/>ALWAYS OpenAI 512-dim"]
    end

    subgraph Providers["Providers"]
        Ollama["Ollama M4 GPU<br/>qwen2.5:3b · llama3.1:8b<br/>$0 dev cost"]
        OpenAIChat["OpenAI Cloud<br/>gpt-4o-mini · gpt-4o<br/>production + EVAL"]
        OpenAIEmb["OpenAI Embeddings<br/>text-embedding-3-small<br/>512-dim · ingest + query"]
    end

    LLMToggle --> GetLLM
    VecFixed --> GetEmb
    GetLLM -->|dev| Ollama
    GetLLM -->|prod| OpenAIChat
    GetEmb --> OpenAIEmb

    Warn["Vector space rule<br/>ingest embeddings MUST match<br/>query embeddings — same model"]
    GetEmb -.-> Warn
    OpenAIEmb -.-> Warn
```

---

## 6. Hybrid SSE Streaming Architecture

```mermaid
flowchart TB
    Client["Frontend<br/>NaturalLanguageBar · ChatConsole"] -->|POST user_input + mode| ChatRouter["chat.py<br/>/api/chat/stream"]

    ChatRouter --> TraceInit["Emit trace_init<br/>request_id"]
    ChatRouter --> AStream["app_graph.astream_events v2"]

    AStream --> E1["on_chat_model_start<br/>→ event: node_start"]
    AStream --> E2["on_chat_model_stream<br/>→ event: token"]
    AStream --> E3["on_chat_model_end<br/>→ record token usage<br/>OpenAI only"]
    AStream --> E4["on_chain_end intent_agent<br/>→ event: filters_parsed"]
    AStream --> E5["on_chain_end review_agent<br/>→ event: citations_loaded"]
    AStream --> E6["on_chain_end LangGraph<br/>→ event: complete<br/>TraceStore.save"]
    AStream --> E7["on_chain_error<br/>→ event: error<br/>partial results"]

    E1 --> Client
    E2 --> Client
    E4 --> FilterBar["FilterBar<br/>chip sync + re-fetch"]
    E5 --> Client
    E6 --> TraceAPI["GET /api/trace/request_id"]
    E7 --> Client

    TraceInit --> TraceStore[("TraceStore<br/>Redis or in-memory · TTL 1hr")]
    E3 --> TraceStore
    E6 --> TraceStore
    TraceStore --> TraceAPI
```

---

## 7. Request Flow — NL Search with Filter Sync

```mermaid
sequenceDiagram
    actor User
    participant NL as NaturalLanguageBar
    participant FE as FilterBar
    participant SSE as chat.py
    participant Graph as LangGraph
    participant Trace as TraceStore
    participant DB as PostgreSQL

    User->>NL: "quiet 1-bed Lisbon under €130 balcony"
    NL->>SSE: POST {user_input, mode: search}
    SSE->>Trace: create(request_id)
    SSE-->>NL: event trace_init

    SSE->>Graph: astream_events(initial_state)
    Graph-->>SSE: on_chat_model_start intent_agent
    SSE-->>NL: event node_start

    Graph-->>SSE: on_chain_end intent_agent + parsed_filters
    SSE-->>FE: event filters_parsed → update chips
    FE->>DB: GET /api/listings?city=Lisbon&max_price=130

    Graph-->>SSE: on_chain_end retrieval_agent
    Graph-->>SSE: on_chat_model_end (token usage)
    Graph-->>SSE: on_chain_end LangGraph

    SSE->>Trace: save(request_id, tokens, steps, latency)
    SSE-->>NL: event complete + request_id

    NL->>SSE: GET /api/trace/request_id
    SSE->>Trace: lookup
    Trace-->>NL: token_usage + agent_steps
```

---

## Key Interactions

### Hybrid SSE events (not raw tokens alone)

| Event | Payload | Frontend action |
| :--- | :--- | :--- |
| `trace_init` | `request_id` | Store for trace lookup |
| `node_start` | `node` name | Show agent progress in ChatConsole |
| `token` | streaming text | Append to chat bubble |
| `filters_parsed` | structured `filters` | FilterBar chip sync + re-fetch listings |
| `citations_loaded` | `citations[]` | Render clickable review links |
| `complete` | `request_id`, `latency_ms` | Close stream |
| `error` | `node`, `recoverable` | Show partial results + fallback message |

### Embeddings vs chat LLMs — pluggability rules

| Component | Pluggable? | Local | Production |
| :--- | :--- | :--- | :--- |
| Embeddings | **No — fixed** | OpenAI 512-dim | OpenAI 512-dim |
| Intent / Review LLM | **Yes** | Ollama qwen2.5:3b | gpt-4o-mini |
| Itinerary LLM | **Yes** | Ollama llama3.1:8b | gpt-4o |
| EVAL scoring | — | — | **OpenAI only** |
| Token telemetry | — | Unreliable (Ollama) | Authoritative (OpenAI) |

### Two AI entry points

| Entry | Component | Mode | Typical path |
| :--- | :--- | :--- | :--- |
| Results page | `NaturalLanguageBar.tsx` | `search` | Intent → Retrieval → END |
| Anywhere | `ChatConsole.tsx` | `concierge` | Intent → Router → full path |

### Conditional routing

- **`search_only`** → Retrieval → END (Itinerary never invoked)
- **`review_compare`** → Retrieval → Review → END
- **`itinerary_plan`** → Retrieval → Review → Itinerary → END

### Review agent — relational, not vector

Fetches reviews by `listing_id` (SQL). No review embeddings in corpus.
Citations validated against fetched `review_id`s before SSE emit.

### Caching layers

| Layer | Key | TTL |
| :--- | :--- | :--- |
| Redis / LRU | `search:{hash}` | 5 min |
| Redis / LRU | `summary:{listing_id}` | 24 hr |
| Redis / LRU | `compare:{ids}` | 1 hr |
| Postgres | `listing_review_summaries` | permanent |

---

## Data Flow — Example Queries

### Query A: NL search

```
User: "quiet 1-bedroom in Lisbon under €130 with balcony for late June"
  → Intent → filters_parsed SSE → FilterBar chips update
  → Retrieval (hybrid SQL + OpenAI 512-dim vector)
  → complete event + request_id
```

### Query B: Review comparison

```
User: "...which has the most consistent reviews?"
  → intent_type: review_compare
  → Retrieval → Review → citations_loaded SSE event
  → complete
```

### Query C: Itinerary (Lisbon/Amsterdam — not Dubai)

```
User: "Plan 4 nights in Lisbon, mid-range near metro + splurge night with view"
  → intent_type: itinerary_plan
  → Retrieval → Review → Itinerary → complete
```

### Query D: Failure case (Loom demo)

```
Review node timeout after retry ×2
  → SSE: {event: error, node: review_agent, recoverable: true}
  → Partial: retrieval results still visible
  → GET /api/trace/request_id shows failed step + latency
```

---

## Component ↔ File Mapping

| Diagram block | Code location |
| :--- | :--- |
| ModelFactory | `backend/app/agents/factory.py` |
| Hybrid SSE router | `backend/app/routers/chat.py` |
| TraceStore | `backend/app/agents/telemetry.py` |
| Trace GET endpoint | `backend/app/routers/trace.py` |
| LangGraph graph | `backend/app/agents/graph.py` |
| Router node | `backend/app/agents/nodes/router.py` |
| Env template | `.env.example` |
| SSE client parser | `frontend/src/lib/sse.ts` |
| Natural Language Bar | `frontend/src/components/NaturalLanguageBar.tsx` |
| Global Concierge | `frontend/src/components/ChatConsole.tsx` |
| FilterBar (chip sync) | `frontend/src/components/FilterBar.tsx` |
| Ingestion Category A+B | `ingestion/scripts/ingest.py` |
| Deploy export | `ingestion/scripts/export_deploy.py` |
