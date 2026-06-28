# Railway / monorepo build — context is repo root (do not set Root Directory to backend).
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libpq5 socat \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV PYTHONUNBUFFERED=1

CMD ["./start.sh"]
