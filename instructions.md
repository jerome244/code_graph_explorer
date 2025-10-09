# Run Docker:
docker compose -f docker-compose.dev.yml up -d --build


# Display Cloudflare html:
docker compose -f docker-compose.dev.yml logs -f cloudflared






# Stop Docker: 
docker compose -f docker-compose.dev.yml down
# clean up old extras if you see “orphan containers”
docker compose -f docker-compose.dev.yml down --remove-orphans