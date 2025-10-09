#!/usr/bin/env bash
set -euo pipefail

echo "Waiting for database ${DB_HOST:-db}:${DB_PORT:-5432}..."
# Simple TCP wait loop
for i in {1..60}; do
  (echo > /dev/tcp/${DB_HOST:-db}/${DB_PORT:-5432}) >/dev/null 2>&1 && break || true
  sleep 1
done

echo "Applying migrations..."
python manage.py migrate --noinput

echo "Collecting static..."
python manage.py collectstatic --noinput || true

echo "Starting Daphne (ASGI) on 0.0.0.0:8000"
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
