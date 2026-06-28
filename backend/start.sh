#!/bin/sh
set -e

PORT="${PORT:-8000}"

# Railway internal healthcheck uses $PORT (often 8080). Public edge may still route to 8000.
if [ "$PORT" != "8000" ]; then
  echo "Forwarding public port 8000 -> app port $PORT"
  socat TCP-LISTEN:8000,fork,reuseaddr TCP:127.0.0.1:"$PORT" &
fi

echo "Starting uvicorn on port $PORT"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
