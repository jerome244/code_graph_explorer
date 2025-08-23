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





Find your LAN IP on the host machine (e.g. 192.168.1.23).

Update frontend/.env.local (then restart Next.js):

NEXT_PUBLIC_WS_BASE=ws://192.168.1.23:8000
API_BASE=http://192.168.1.23:8000
NEXT_PUBLIC_API_BASE=http://192.168.1.23:8000


Run the backend listening on all interfaces:

# Django dev
python manage.py runserver 0.0.0.0:8000
# or Daphne/Channels
daphne -b 0.0.0.0 -p 8000 config.asgi:application


Run Next.js (bind to all interfaces just to be safe):

npm run dev -- -H 0.0.0.0 -p 3000
# or for prod: next build && next start -H 0.0.0.0 -p 3000


Firewall/CORS (on the host):

Allow inbound 3000 and 8000.

In Django settings:

ALLOWED_HOSTS = ["192.168.1.23", "localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = ["http://192.168.1.23:3000"]


Second player joins by opening (on their device/browser):

http://192.168.1.23:3000/pong?room=lobby





user@DESKTOP-T6R9LL5:/mnt/c$ ipconfig.exe | grep -i "ipv4"



https://the-odds-api.com/sports-odds-data/sports-apis.html?utm_source=chatgpt.com




docker ps --filter "publish=6379" \
  --format 'TABLE {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}'



docker stop a93526c3d741
docker rm a93526c3d741      # optional but tidy

# now run the one you want
docker run --rm --name redis7 -p 6379:6379 redis:7








# Redis (for Django Channels)
docker rm -f redis || true
docker run -d --name redis --restart unless-stopped \
  -p 127.0.0.1:6379:6379 redis:7

# Tor SOCKS proxy
docker rm -f torproxy || true
docker run -d --name torproxy --restart unless-stopped \
  -p 127.0.0.1:9150:9050 dperson/torproxy:latest
