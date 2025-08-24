# from: code_graph_explorer/
npm init -y
npm i -D concurrently


cd backend
python -m daphne -p 8000 config.asgi:application


# in backend venv
sudo service redis-server start
python -m daphne -p 8000 config.asgi:application