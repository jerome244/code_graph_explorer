# in backend venv
sudo service redis-server start

python -m daphne -p 8000 config.asgi:application


cd frontend
npm ci
npm run dev



sudo apt update
sudo apt install tor
sudo service tor start           
SOCKS at 127.0.0.1:9050
sudo service tor status



npm i @react-three/fiber three
