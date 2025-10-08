# run:
docker compose -f docker-compose.dev.yml up -d --build


# check : 
docker compose -f docker-compose.dev.yml ps

# create first time admin user :
docker compose -f docker-compose.dev.yml exec backend python manage.py createsuperuser


# watch logs : 
docker compose -f docker-compose.dev.yml logs -f backend
# or both:
docker compose -f docker-compose.dev.yml logs -f backend frontend




# stop everything : 
docker compose -f docker-compose.dev.yml down
# clean up old extras if you see “orphan containers”
docker compose -f docker-compose.dev.yml down --remove-orphans




# check :
docker compose -f docker-compose.dev.yml exec -T db sh -lc \
'PGPASSWORD="postgres" psql -h localhost -U postgres -d codegraph -c "\conninfo"'




# if password doesnt match with actual db :
If it fails, set the password (no data loss)

Inside the running DB container, change the postgres user’s password to match your .env:

docker compose -f docker-compose.dev.yml exec -T db sh -lc \
'psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '\''postgres'\'';"'


(If that command asks for a password and you don’t know it, skip to the “reset volume” option below.)

Also ensure the database exists:

docker compose -f docker-compose.dev.yml exec -T db sh -lc '
psql -U postgres -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='\''codegraph'\''" | grep -q 1 || \
psql -U postgres -d postgres -c "CREATE DATABASE codegraph OWNER postgres"
'


Then restart the backend:

docker compose -f docker-compose.dev.yml up -d backend



# change existing password :
docker compose -f docker-compose.dev.yml exec -T db psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'newpass';"

# delete data:
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d


# see where docker is located :
docker volume inspect code_graph_explorer_db-data -f '{{ .Mountpoint }}'





# Keep an eye on disk usage
# What’s taking space:
docker system df -v
docker volume ls

# Safe-ish cleanup (removes unused stuff; read prompts carefully):
docker system prune
docker system prune -a --volumes   # more aggressive; deletes unused images + volumes

# Remove just this project’s volume (⚠️ wipes DB):
docker compose -f docker-compose.dev.yml down -v

