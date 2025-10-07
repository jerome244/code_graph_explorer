#!/usr/bin/env sh
set -e

# If Postgres is configured, wait for it
if [ -n "$DB_HOST" ]; then
  echo "Waiting for Postgres at $DB_HOST:${DB_PORT:-5432}..."
  until nc -z "$DB_HOST" "${DB_PORT:-5432}"; do sleep 1; done
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Run Daphne (ASGI, needed for Channels/WebSockets)
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
