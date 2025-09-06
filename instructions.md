pip install -r requirements.txt
daphne -p 8000 config.asgi:application

npm i
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev

caddy run --config ./Caddyfile

cloudflared tunnel --url http://localhost:8080


https://clothes-dm-survey-tie.trycloudflare.com/games/minecraft?session=alpha-world