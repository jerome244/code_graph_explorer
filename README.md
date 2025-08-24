# in backend venv
sudo service redis-server start

python -m daphne -p 8000 config.asgi:application


cd frontend
npm ci
npm run dev



python - <<'PY'
import config.asgi
print(type(config.asgi.application).__name__)
PY