cd ~/holberton
source venv/bin/activate
cd code_graph_explorer/backend/
pip install -r requirements.txt
daphne -p 8000 config.asgi:application