pip install -r requirements.txt
daphne -p 8000 config.asgi:application



cloudflared tunnel --url http://localhost:8000


in /backend/config/settings.py change PUBLIC_ORIGIN by new url

and in /frontend/.env.local too