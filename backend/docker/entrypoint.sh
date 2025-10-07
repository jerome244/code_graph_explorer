#!/usr/bin/env bash
set -e

# optional: wait a moment for host DB (usually instant)
python - <<'PY'
import os, time, psycopg2
host = os.environ.get('DB_HOST')
port = int(os.environ.get('DB_PORT','5432'))
name = os.environ.get('DB_NAME')
user = os.environ.get('DB_USER')
pwd  = os.environ.get('DB_PASSWORD')
for i in range(30):
    try:
        psycopg2.connect(host=host, port=port, dbname=name, user=user, password=pwd).close()
        break
    except Exception as e:
        time.sleep(1)
PY

python manage.py migrate --noinput
python manage.py collectstatic --noinput || true

exec "$@"
