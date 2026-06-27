## **- Full Stack AI Developer Technical Assignment** 

**Role:** Senior Full Stack AI Developer **Domain:** AI-native travel discovery and booking 

**Submission:** Public GitHub repo + live deployed URL + 5-minute Loom walkthrough **Time: 48 hours** 

## **1. Context** 

Picture Booking.com and Expedia with an AI brain underneath: the traditional booking experience users already trust (filters, map, listing pages, calendars, reviews) augmented by a conversational concierge, intelligent recommendations, review synthesis, and multi-stop itinerary planning. You will deliver a working slice on real or synthetic travel data. 

We will run your code, read it, and check the deployed app. 

## **2. The Task** 

Build a working end-to-end application that satisfies all five layers below. 

## **2.1 Data Layer** 

You may use real public data, generate synthetic data, or mix both. Whatever you pick, the system must work on **at least 50,000 listings and 200,000 reviews** spread across **at least two cities** . 

## _**Option A**_ **- Real data (preferred):** 

- **Inside Airbnb** (free, public): https://insideairbnb.com/get-the-data/ 

- 

- Provides listings.csv.gz, calendar.csv.gz, reviews.csv.gz, and neighbourhoods.geojson per city. 

   - A major city alone has 70K-100K listings and 1M+ reviews. 

- **Maven Analytics compiled Airbnb dataset** (10 cities, 250K+ listings, 5M+ reviews, 

   - single bundle): https://mavenanalytics.io/data-playground/airbnb-listings-reviews 

- **Booking.com 515K Hotel Reviews (Europe)** on Kaggle: 

https://www.kaggle.com/datasets/jiashenliu/515k-hotel-reviews-data-in-europe 

`o` 1493 hotels in 6 cities, 515K reviews with explicit positive/negative columns. 

## _**Option B**_ **- Synthetic data:** 

Generate it yourself with Faker, an LLM, or both. The schema must include at minimum: 

- Properties (id, name, type, city, neighbourhood, lat/lng, price, beds, amenities, photos URL, host info) 

- Calendar (property_id, date, available, price) 

- Reviews (property_id, date, reviewer, rating, text, language) 

Generation script must be in the repo and re-runnable. Document any LLM costs you incurred to generate it. 

## **Pipeline requirements (whichever option you choose):** 

- Re-runnable ingestion pipeline that completes on your machine. 

- Sensible split across relational store + vector store + (optional) geospatial index. Justify the split. 

- **At least two non-trivial enrichments** during ingestion. Pick any two: 

   - Embeddings for listings and reviews 

   - Aspect-level sentiment per review (cleanliness, location, value, staff, noise) 

   - Per-property review summary precomputed at ingest 

   - Neighbourhood price percentile ("is this expensive for the area") 

   - Amenity normalization across listings 

## **2.2 Booking-style Product Surface (this is core, not optional)** 

The app must look and feel like a real booking product, not a chat box. Build all of the following: 

## **Search and filter:** 

- Date range picker (check-in / check-out) with availability awareness from the calendar data. 

- Guest selector (adults, children, rooms). 

- Price range slider. 

- Rating / review score filter. 

- Property type filter (entire place, private room, hotel, etc.). 

- Amenities filter (wifi, pool, kitchen, parking, etc.). 

- Sort options (price low-to-high, rating, popularity, distance to a point). 

## **Results experience:** 

- **List view** with proper listing cards (photo, name, price per night, total for stay, rating, key amenities, distance signal). 

- **Map view** (Mapbox, MapLibre, Leaflet) with markers showing price, clustering at zoomout, list and map stay in sync on hover and pan. 

- Pagination or infinite scroll, both fine. 

## **Property detail page:** 

- Photo gallery. 

- Amenities grid. 

- Embedded map with neighborhood context. 

- **Reviews section** with filtering (by language, by score, by topic), aspect-level scores (cleanliness, location, value, etc.), and an **AI-generated review summary** at the top ("Guests consistently praise X, occasionally complain about Y"). 

- Availability calendar. 

- Price breakdown for the selected dates (nights × rate + taxes/fees mocked). 

- Mocked "Reserve" button leading to a confirmation screen. No real payment. 

## **Saved / compare:** 

- Wishlist (save listings). 

- Side-by-side compare for 2-4 listings (price, amenities, AI verdict). 

## **2.3 AI Layer (on top of the booking product)** 

The AI is not the entire product. It is the brain that makes the booking product smarter. Build the following: 

**Natural language search bar** at the top of the results page. It runs alongside the traditional filters. When a user types _"a quiet 1-bed in Lisbon under €130 with a balcony for late June"_ , the system parses it into structured filters and applies them, with the filter chips visibly updated so the user sees what was understood. 

**Multi-agent concierge** accessible from anywhere in the app, with at least **four specialized agents** : 

1. **Intent agent** : turns natural language into a structured query (city, dates, budget, party size, vibe, hard constraints, soft preferences). 

2. **Retrieval agent** : semantic + filtered + geospatial search over the corpus, returns a ranked candidate set with a per-result rationale. 

3. **Review intelligence agent** : synthesizes insights from the review corpus for any property or candidate set, with citations to actual reviews. 

4. **Itinerary agent** : produces multi-day, multi-property plans with day-by-day cards, total cost, and one-click swap-out per stay. 

Use any framework you want: LangGraph, CrewAI, Microsoft Agent Framework, AutoGen, OpenAI Agents SDK, or your own. In the README explain in 3 to 5 lines **why** you picked it. 

The system must handle queries at this level: 

_"Find me a quiet 1-bedroom in Lisbon near good restaurants for 3 nights in late June, under €130 a night, balcony if possible, no party-type buildings, and tell me which one has the most consistent reviews."_ 

_"Plan a 4-night Dubai trip for a couple with one mid-range hotel near the metro and one splurge night somewhere with a view. Budget AED 4000 total. Avoid Deira."_ 

## **2.4 Backend** 

- API service exposing both the traditional search/filter endpoints and the agent system. 

- **Streaming responses** for agent calls (SSE or WebSocket). Intermediate agent steps should be visible to the user. 

- Proper async, no blocking the event loop. 

- Per-request **token usage** , **latency** , and **agent step trace** exposed via an endpoint or log. 

- **Caching layer** for repeated retrievals and review syntheses. Travel queries cluster heavily, so this matters. 

- At least one **batch endpoint** (e.g. compare 5 listings, produce review summaries for top 20 in parallel). 

## **2.5 Frontend** 

- Single-page app in React, Next.js, or framework of your choice. 

- Booking-style product surface as specified in 2.2. 

- Conversational concierge with smooth streaming and visible agent steps. 

- Citations in every agent answer click through to the listing or the underlying review. 

- It should not look like a generic Bootstrap template. Real UX thinking matters. Reference 

points: Booking.com, Airbnb, Mindtrip, Layla, Hopper. Pick what works. 

## **2.6 Deployment** 

Deploy the full stack to a publicly reachable URL (Vercel, Render, Railway, Fly, Hugging Face Spaces, AWS, your own VPS, anywhere). We will use it. 

## **3. What We Are Evaluating** 

|**Capability**|**What we look for**|
|---|---|
|**Large data handling**|50K+ listings, 200K+ reviews handled cleanly. Chunking, indexing,<br>geospatial queries, memory awareness.|
|**LLM engineering**|Prompt design, structured outputs, cost-aware patterns, hallucination<br>control on real data, basic eval thinking.|
|**Agent design**|Clear separation of concerns, sane state passing, retries, failure handling,<br>observable steps.|
|**Backend craft**|API design, streaming, async, caching, observability.|
|**Frontend craft and**<br>**product instinct**|Booking-style UX done right. Filters work. Map and list stay in sync.<br>Conversational layer integrates cleanly with the traditional flow.|
|**Architectural judgment**|Choices you made and choices you deliberately did NOT make.|



Equal weight across all six. 

## **4. Constraints and Permissions** 

- Total effort: **no more than 48 hours** . We respect your time. Tell us how long you actually spent. 

- Any LLM provider is fine (Claude, GPT, Gemini, open-weights). State your choice and why. 

- Any vector DB is fine (pgvector, Qdrant, Weaviate, Pinecone, Chroma, LanceDB). State why. 

- You do not need real booking inventory or payment. Mock "Reserve" with a confirmation screen. 

- AI coding assistants (Claude Code, Cursor, Copilot, Windsurf) are **fully allowed and encouraged** . We use them every day. We care about the output, not the keystrokes. 

- If you scope something down to stay inside 48 hours, document the trade-off. That is itself signal. 

## **5. Deliverables** 

1. **GitHub repository** (public, or private and shared with us). README must include: 

   - One-command local run (docker-compose preferred). 

   - Architecture diagram (Mermaid is fine). 

   - Data choice (real, synthetic, mixed) and why. 

   - Key trade-offs you made. 

   - What you would change with another week. 

- Rough cost estimate per user query at production scale (back-of-envelope is fine). 

## 2. **Live deployed URL** . 

3. **5-minute Loom video** . No slides. Walk through the architecture, then a live demo 

   - showing: (a) a traditional filter-based search, (b) a natural language search, (c) one of the complex agent queries above, (d) one failure case and how the system handles it. 

4. **EVAL.md** in the repo: how you measured the quality of agent outputs. A small set of golden travel queries with manual scoring is enough. We want to see eval thinking. 

## **6. Out of Scope** 

You do **not** need to build: 

- Authentication or user accounts. 

- Real payments or real booking. 

- Flight inventory (stays only is fine, flights are a bonus). 

- Production HA, multi-region, or autoscaling. 

- Mobile-perfect responsive (must not break on a laptop, that is enough). 

- Marketing copy, logos, branding. 

Effort spent on these instead of the six capabilities above counts against you. 

## **7. Submission** 

Send the following to the email address you received this brief from: 

1. GitHub repo link 

2. Live deployed URL 

3. Loom video link 

We respond to clarifying questions within 24 hours. Default to building rather than asking. 

