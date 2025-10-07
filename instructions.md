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



# Frontend (terminal #2):
cd ~/holberton/code_graph_explorer/frontend/
npm i
npm i @tensorflow/tfjs @tensorflow/tfjs-backend-webgl @tensorflow/tfjs-backend-webgpu
npm install three@0.160.0 @react-three/fiber@8 @react-three/drei@9 --save-exact
npm run dev


# Caddy (terminal #3):
cd ~/holberton/code_graph_explorer
caddy run --config ./Caddyfile


# Cloudflared (terminal #4):
cd ~/holberton/code_graph_explorer
cloudflared tunnel --protocol http2 --edge-ip-version 4 --url http://localhost:8080






python manage.py shell -c "from django.db import connection; print('vendor:', connection.vendor); cursor=connection.cursor(); cursor.execute('select version()'); print(cursor.fetchone()[0]);"

python manage.py shell -c "from django.db import connection; import json; print(json.dumps({k:connection.settings_dict[k] for k in ['NAME','USER','HOST','PORT']}, indent=2))"


psql -h 127.0.0.1 -U codegraph -d code_graph_explorer -W   # enter: 007

check Django :
python manage.py shell -c "from django.db import connection; print(connection.settings_dict['PASSWORD'])"


Change Postgresql password if needed:
sudo -u postgres psql
ALTER ROLE codegraph WITH LOGIN PASSWORD '007';
\q
