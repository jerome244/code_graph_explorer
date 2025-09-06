cd ~/holberton
source venv/bin/activate
cd code_graph_explorer/backend/
pip install -r requirements.txt
daphne -p 8000 config.asgi:application


cd ~/holberton/code_graph_explorer/frontend/
npm i
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev


cd ~/holberton/code_graph_explorer
caddy run --config ./Caddyfile


cd ~/holberton/code_graph_explorer
cloudflared tunnel --url http://localhost:8080


