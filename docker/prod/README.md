B) When you’re ready for production (optional)

(You can keep dev and prod side-by-side.)

Env suggestions

DEBUG=0
DJANGO_SECRET_KEY=changeme-long-random
ALLOWED_HOSTS=your.domain.com,localhost
PUBLIC_ORIGIN=https://your.domain.com


Typical flow

# 1) Prepare prod files (compose + Dockerfiles). If you want,
#    I can generate a clean `docker-compose.prod.yml` for you.
# 2) Build & start:
docker compose -f docker-compose.prod.yml up -d --build

# 3) Create admin (first time)
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser

# 4) Logs
docker compose -f docker-compose.prod.yml logs -f backend