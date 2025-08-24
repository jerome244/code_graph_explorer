# in backend venv
sudo service redis-server start

python -m daphne -p 8000 config.asgi:application


cd frontend
npm ci
npm run dev



