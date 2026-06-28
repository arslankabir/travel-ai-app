#!/usr/bin/env bash
# Start local infrastructure (Postgres + Redis). Run backend + frontend separately.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — set OPENAI_API_KEY before ingesting or using AI features."
fi

docker compose up -d
echo "Waiting for Postgres..."
until docker compose exec -T db pg_isready -U postgres -d travel_db >/dev/null 2>&1; do sleep 1; done
echo "✓ Database ready at localhost:5432"
echo ""
echo "Next (separate terminals):"
echo "  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000"
echo "  cd frontend && npm install && npm run dev"
echo ""
echo "Optional Ollama (local chat): ollama pull qwen2.5:3b && ollama pull llama3.1:8b"
