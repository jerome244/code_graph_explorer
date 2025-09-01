npm i
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev







DJANGO_API_BASE=http://localhost:8000
COOKIE_SECURE=false
NEXT_PUBLIC_DJANGO_WS_BASE=ws://localhost:8000





cloudflared tunnel --url http://localhost:3000





example 

# point REST + WS to the BACKEND tunnel (notice https / wss)
DJANGO_API_BASE=https://playlist-salaries-burlington-colleges.trycloudflare.com
NEXT_PUBLIC_WS_URL=wss://playlist-salaries-burlington-colleges.trycloudflare.com

# keep cookies non-secure during local dev (site is http://localhost:3000)
COOKIE_SECURE=false

# (optional, for older code paths) set this too:
NEXT_PUBLIC_DJANGO_WS_BASE=wss://playlist-salaries-burlington-colleges.trycloudflare.com
