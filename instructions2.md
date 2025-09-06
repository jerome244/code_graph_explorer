pip install -r requirements.txt
export DJANGO_SECRET_KEY='change-me-32+chars'
export DJANGO_DEBUG=1                       # use DEBUG=1 if the repo expects that
export ALLOWED_HOSTS='localhost,127.0.0.1'
export CORS_ALLOW_ALL_ORIGINS=1             # or CORS_ALLOW_ALL=1 if repo expects that
export SESSION_COOKIE_SECURE=0              # or COOKIE_SECURE=0 if repo expects that
export CSRF_COOKIE_SECURE=0
export TOR_SOCKS_URL='socks5h://127.0.0.1:9050'
export DARKWEB_FETCH_TIMEOUT=20
export DARKWEB_MAX_BYTES=150000
export DARKWEB_ARTICLE_BYTES=2000000
export DARKWEB_ARTICLE_TEXT_LIMIT=200000



mac os:
brew install tor
brew services start tor       # runs Tor as a background service



ubuntu :
sudo apt update
sudo apt install tor
# service usually starts automatically; if not:
sudo systemctl enable --now tor




cd backend
daphne -p 8000 config.asgi:application




npm i
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev

caddy run --config ./Caddyfile

cloudflared tunnel --url http://localhost:8080
