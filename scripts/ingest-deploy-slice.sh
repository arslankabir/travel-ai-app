#!/usr/bin/env bash
# Load ~10–15K listing deploy slice into Supabase (or any remote Postgres).
#
# Usage:
#   export SUPABASE_DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@db.unrkkzzmeumoogivclpv.supabase.co:5432/postgres'
#   ./scripts/ingest-deploy-slice.sh          # full slice with embeddings
#   ./scripts/ingest-deploy-slice.sh smoke    # quick 200-row test, no embeddings
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PYTHON="${ROOT}/ingestion/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3 || command -v python || true)"
fi
if [[ -z "$PYTHON" ]]; then
  echo "ERROR: No Python found. Run: cd ingestion && python3 -m venv .venv && pip install -r requirements.txt"
  exit 1
fi

if [[ -z "${SUPABASE_DATABASE_URL:-}" ]]; then
  echo "ERROR: Set SUPABASE_DATABASE_URL first."
  echo "  export SUPABASE_DATABASE_URL='postgresql://postgres:PASSWORD@db.unrkkzzmeumoogivclpv.supabase.co:5432/postgres'"
  exit 1
fi

export DATABASE_URL="$SUPABASE_DATABASE_URL"

if [[ ! -d ingestion/raw_data/lisbon ]]; then
  echo "ERROR: ingestion/raw_data/lisbon not found. Download Inside Airbnb data first."
  exit 1
fi

if [[ "${1:-}" == "smoke" ]]; then
  echo "Smoke test: lisbon 200 rows, no embeddings..."
  "$PYTHON" ingestion/scripts/ingest.py --city lisbon --limit 200 --skip-embeddings --reviews-per-listing 5
else
  if [[ -z "${OPENAI_API_KEY:-}" || "$OPENAI_API_KEY" == "your_openai_key_here" ]]; then
    if [[ -f "$ROOT/.env" ]]; then
      set -a && source "$ROOT/.env" && set +a
    fi
  fi
  if [[ -z "${OPENAI_API_KEY:-}" || "$OPENAI_API_KEY" == "your_openai_key_here" ]]; then
    echo "ERROR: OPENAI_API_KEY required for embeddings (or run: $0 smoke)"
    exit 1
  fi
  echo "Deploy slice: lisbon 10k + barcelona 5k with embeddings..."
  "$PYTHON" ingestion/scripts/ingest.py --city lisbon --limit 10000 --reviews-per-listing 5
  "$PYTHON" ingestion/scripts/ingest.py --city barcelona --limit 5000 --reviews-per-listing 5
fi

echo ""
echo "Verify in Supabase SQL editor:"
echo "  SELECT city, COUNT(*) FROM listings GROUP BY city;"
echo "  SELECT COUNT(*) FROM reviews;"
