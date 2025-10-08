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

