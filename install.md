## Architecture of tunnel/reversed proxy/ports:

Browser on the internet
        │
https://your-tunnel.trycloudflare.com
        │  (tunnel)
        ▼
   cloudflared  ──►  http://localhost:8080  (Caddy)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
            http://127.0.0.1:3000           http://127.0.0.1:8000
                 (Next)                   (/api, /ws → Django/Channels)


## Installation:

1) cd backend
pip install -r requirements.txt
daphne -p 8000 config.asgi:application

2) cd frontend
npm i
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev

3) in root:
caddy run --config Caddyfile
cloudflared tunnel --url http://localhost:8080

4) in /backend/config/settings.py:
change PUBLIC_ORIGIN old url by new url

5) in /frontend/.env.local
change PUBLIC_ORIGIN old url by new url too