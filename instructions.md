cd backend
pip install -r requirements.txt
daphne -p 8000 config.asgi:application


cd frontend
npm i
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev


from root:
caddy run --config ./Caddyfile

cloudflared tunnel --url http://localhost:8080




webpage test minecraft
https://courts-helena-charming-sq.trycloudflare.com/games/minecraft?session=alpha-world