pip install -r requirements.txt
export DEBUG=0
export DJANGO_SECRET_KEY='change-me-32+chars'
export ALLOWED_HOSTS='localhost,127.0.0.1,app.example.com'
export COOKIE_SECURE=1
export CORS_ALLOW_ALL=0
export PUBLIC_ORIGIN='https://app.example.com'
daphne -p 8000 config.asgi:application

npm i
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev

caddy run --config ./Caddyfile

cloudflared tunnel --url http://localhost:8080


