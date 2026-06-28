# Evaluation — Travel AI Platform

Manual eval of agent outputs against golden travel queries. Scored on a **1–5 rubric** after live runs against the local stack (Ollama chat + OpenAI embeddings) or production (OpenAI chat + embeddings).

## Rubric

| Score | Meaning |
| :---: | :--- |
| 5 | Fully correct filters, relevant stays, coherent review synthesis with valid citations, graceful edge cases |
| 4 | Minor gaps (e.g. one filter relaxed, summary slightly generic) but usable |
| 3 | Partial success — some results or insight, notable misses |
| 2 | Wrong city/filters or empty results without clear explanation |
| 1 | Broken, hallucinated IDs, or irrelevant response |

## Environment

| Config | Intent / Review / Itinerary | Embeddings | Notes |
| :--- | :--- | :--- | :--- |
| **Local dev** | Ollama `qwen2.5:3b` / `llama3.1:8b` | OpenAI `text-embedding-3-small` @ 512d | Citations use DB fallback when structured output fails |
| **Production (deploy)** | OpenAI `gpt-4o-mini` / `gpt-4o` | Same embedding model | Authoritative for submission scoring |

Record date, model config, and `request_id` (trace link) for each run.

---

## Golden queries

### G1 — NL search (structured filters)

**Query (search mode / NL bar):**
> quiet 1-bedroom in Lisbon under €130 with a balcony for late June

**Expected:**
- `city=lisbon`, `bedrooms=1`, `max_price≈130`, `amenity=balcony` (or semantic equivalent)
- Filter chips update; listing count > 0 (may relax dates if calendar tight)

| Run | Score | Notes |
| :--- | :---: | :--- |
| 2026-06-28 local | 4 | Filters parsed; dates sometimes dropped on relaxation |

---

### G2 — Complex concierge (golden query)

**Query (concierge):**
> Find me a quiet 1-bedroom in Lisbon near good restaurants for 3 nights in late June, under €130 a night, balcony if possible, no party-type buildings, and tell me which one has the most consistent reviews.

**Expected:**
- Intent → retrieval → review pipeline
- ≥1 Lisbon stay under €130; review summary comparing consistency
- Source review links; main list/map sync

| Run | Score | Notes |
| :--- | :---: | :--- |
| 2026-06-28 local | 4 | 8 stays after relaxation; review summary + citation links via fallback |

---

### G3 — Review compare (city-specific)

**Query (concierge):**
> Which Barcelona pool stays under €200 have the best and most consistent guest reviews?

**Expected:**
- `city=barcelona`, pool amenity, price cap
- Review agent runs; citations or summary

| Run | Score | Notes |
| :--- | :---: | :--- |
| 2026-06-28 local | 4 | Results + review block; pool filter may relax |

---

### G4 — Unsupported city (failure handling)

**Query (concierge):**
> Plan a 4-night Dubai trip for a couple, budget AED 4000, hotel near metro.

**Expected:**
- Clear message: Dubai not in dataset (5 European cities only)
- No fake listings; no silent empty retrieval

| Run | Score | Notes |
| :--- | :---: | :--- |
| 2026-06-28 local | 5 | Unsupported-city message |

---

### G5 — Chitchat guard

**Query (concierge):**
> hi

**Expected:**
- Friendly greeting only; no retrieval dump, no raw JSON

| Run | Score | Notes |
| :--- | :---: | :--- |
| 2026-06-28 local | 5 | Chitchat intent; no listings |

---

### G6 — Batch compare (product surface)

**Action:** Select 2–4 Lisbon listings → `/compare`

**Expected:**
- Side-by-side price, rating, amenities matrix
- AI verdict names a recommendation

| Run | Score | Notes |
| :--- | :---: | :--- |
| 2026-06-28 local | 4 | Matrix + verdict; LLM latency ~3–8s on Ollama |

---

### G7 — Batch summarize (parallel)

**Action:**
```bash
curl -s -X POST http://localhost:8000/api/batch/summarize \
  -H "Content-Type: application/json" \
  -d '{"listing_ids":["33348","45855270"]}' | python3 -m json.tool
```

**Expected:** 2 summaries, `request_id` for trace; second call hits cache (`cached_count` > 0).

| Run | Score | Notes |
| :--- | :---: | :--- |
| | | |

---

## Trace verification

For any concierge query, confirm observability:

```bash
curl -s "http://localhost:8000/api/trace/{request_id}" | python3 -m json.tool
```

Check: `steps[]` with node names, `total_latency_ms`, token usage (when OpenAI).

---

## Known limitations (not scored as failures)

1. **Ollama structured output** — review citations may use DB fallback instead of LLM-parsed IDs.
2. **Date + amenity stacking** — retrieval relaxes filters stepwise when calendar/amenity yields 0 rows.
3. **No Dubai/Asia data** — G4 adapted per dataset scope.
4. **Dubai golden query in brief** — demo uses Lisbon/Barcelona instead.

---

## What we'd add with another week

- Automated eval script (pytest + fixed seed listings)
- OpenAI-only production runs logged to JSONL for regression
- RAGAS or LLM-as-judge for review summary faithfulness
- Precomputed `listing_review_summaries` for faster detail/compare pages
