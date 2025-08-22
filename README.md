1) run Docker
sudo service redis-server stop 
docker run --rm -p 6379:6379 redis:7


2) Start Django (ASGI)
cd backend
daphne -p 8000 config.asgi:application
# or during dev: python manage.py runserver 0.0.0.0:8000  (Channels makes it ASGI)


3) Start Next.js
cd frontend
npm run dev

