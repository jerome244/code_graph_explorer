npm i
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev







DJANGO_API_BASE=http://localhost:8000
COOKIE_SECURE=false
NEXT_PUBLIC_DJANGO_WS_BASE=ws://localhost:8000





caddy run --config Caddyfile


cloudflared tunnel --url http://localhost:8080






.env.local

# Next server → Django (server-to-server). Local is fine.
DJANGO_API_BASE=http://localhost:8000

# Cookies must be Secure because your public URL is HTTPS via cloudflared
COOKIE_SECURE=true

# Public origin for Django CSRF (read by backend via env)
PUBLIC_ORIGIN=https://notified-configure-theme-hills.trycloudflare.com

# IMPORTANT: Let the app derive WS base from the current page host.
# Do NOT point this at localhost when teammates use the public URL.
# If you must set it explicitly, use your public host with wss://
# NEXT_PUBLIC_DJANGO_WS_BASE=wss://notified-configure-theme-hills.trycloudflare.com
