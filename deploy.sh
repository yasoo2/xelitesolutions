#!/bin/bash

# Deploy script to pull latest changes and rebuild the web container
echo "Starting deployment process..."

echo "1. Pulling latest changes from git..."
git fetch origin main && git reset --hard origin/main
echo "Deployed commit: $(git rev-parse --short HEAD)"

echo "2. Rebuilding and restarting web container..."
# Check if docker command exists
if command -v docker &> /dev/null; then
    if docker compose version >/dev/null 2>&1; then
        COMPOSE="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        COMPOSE="docker-compose"
    else
        echo "Neither 'docker compose' nor 'docker-compose' is available." && exit 1
    fi

    echo "Docker version:"
    docker version || true
    echo "Compose version:"
    $COMPOSE version || true

    if [ -f docker-compose.production.yml ] && [ -f /opt/joe/env/web.env ] && [ -f /opt/joe/env/api.env ] && [ -f /opt/joe/env/worker.env ]; then
        COMPOSE_FILE="docker-compose.production.yml"
    elif [ -f docker-compose.server.yml ] && [ -f ./env/web.env ]; then
        COMPOSE_FILE="docker-compose.server.yml"
    elif [ -f docker-compose.yml ]; then
        COMPOSE_FILE="docker-compose.yml"
    elif [ -f docker-compose.server.yml ]; then
        COMPOSE_FILE="docker-compose.server.yml"
        echo "Warning: ./env/web.env not found; compose may fail if env_file is required."
    elif [ -f docker-compose.production.yml ]; then
        COMPOSE_FILE="docker-compose.production.yml"
        echo "Warning: /opt/joe/env/*.env not found; compose may fail if env_file is required."
    else
        echo "No docker-compose file found in $(pwd)" && exit 1
    fi

    $COMPOSE -f "$COMPOSE_FILE" build --pull --no-cache web
    $COMPOSE -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans web nginx
    WEB_CID="$($COMPOSE -f "$COMPOSE_FILE" ps -q web 2>/dev/null || true)"
    if [ -n "$WEB_CID" ]; then
        echo "Web container: $WEB_CID"
        docker inspect -f 'Image={{.Image}} Created={{.Created}}' "$WEB_CID" || true
        docker exec "$WEB_CID" sh -lc 'ls -l /usr/share/nginx/html/index.html && sha256sum /usr/share/nginx/html/index.html | head -n 1' || true
    else
        echo "Warning: web container not found after deploy."
    fi
    echo "Deployment command executed successfully."
else
    echo "Error: 'docker' command not found in this environment."
    echo "Please ensure Docker is installed and in your PATH."
    exit 1
fi
