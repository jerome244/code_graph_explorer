# Backend (same shell so env vars apply)
cd ~/holberton
source venv/bin/activate

# DB env for PostgreSQL (quoted to be safe)
export DB_NAME='code_graph_explorer'
export DB_USER='codegraph'
export DB_PASSWORD='007'
export DB_HOST='127.0.0.1'
export DB_PORT='5432'

cd code_graph_explorer/backend/
pip install -r requirements.txt

# Create/upgrade schema in Postgres
python manage.py migrate

# Start ASGI server
daphne -p 8000 config.asgi:application








## test ws limit

terminal A:
pkill -f daphne  # or Ctrl+C the running one
export GAME_MAX_PLAYERS_PER_SESSION=1
export GAME_MAX_CONN_PER_USER=2   # (per-user cap only applies to logged-in users)
daphne -b 0.0.0.0 -p 8000 config.asgi:application



terminal B:
wscat -c ws://127.0.0.1:8000/ws/game/testroom/



terminal C:
wscat -c ws://127.0.0.1:8000/ws/game/testroom/







{"type":"ping"}
{"type":"join","name":"Alice"}
{"type":"chat","message":"hello everyone"}
{"type":"move","x":1,"y":2,"z":3}
{"type":"place_block","x":0,"y":0,"z":0,"block":"stone"}
{"type":"remove_block","x":0,"y":0,"z":0}





{"type":"chat","message":"B joined!"}
