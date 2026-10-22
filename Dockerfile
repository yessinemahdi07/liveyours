FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py migrations.py ./
COPY liveyours/ ./liveyours/
COPY migrations/ ./migrations/
COPY --from=frontend-build /build/frontend/dist ./frontend/dist
CMD ["sh", "-c", "python -c 'from migrations import run_migrations; run_migrations()' && exec gunicorn --workers 1 --threads 4 --bind 0.0.0.0:${PORT:-10000} app:app"]
