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

    PROJECT_NAME="joe"

    if [ -f docker-compose.production.yml ] && [ -f /opt/joe/env/web.env ] && [ -f /opt/joe/env/api.env ]; then
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

    echo "Using compose: $COMPOSE -p $PROJECT_NAME -f $COMPOSE_FILE"
    if [ -f .env ]; then
        JWT_LINE="$(grep -E '^JWT_SECRET=' .env | head -n 1 || true)"
        JWT_VAL="${JWT_LINE#JWT_SECRET=}"
        if [ -z "${JWT_VAL:-}" ] || [ "$JWT_VAL" = "\$JWT_SECRET" ]; then
            echo "Fixing JWT_SECRET in .env..."
            NEW_JWT="$(openssl rand -base64 32)"
            awk -v v="$NEW_JWT" 'BEGIN{found=0} /^JWT_SECRET=/{print "JWT_SECRET="v; found=1; next} {print} END{if(!found) print "JWT_SECRET="v}' .env > .env.tmp && mv .env.tmp .env
        fi
        WORKER_LINE="$(grep -E '^WORKER_API_KEY=' .env | head -n 1 || true)"
        WORKER_VAL="${WORKER_LINE#WORKER_API_KEY=}"
        if [ -z "${WORKER_VAL:-}" ] || [ "$WORKER_VAL" = "\$WORKER_KEY" ]; then
            echo "Fixing WORKER_API_KEY in .env..."
            NEW_WORKER="$(openssl rand -hex 16)"
            awk -v v="$NEW_WORKER" 'BEGIN{found=0} /^WORKER_API_KEY=/{print "WORKER_API_KEY="v; found=1; next} {print} END{if(!found) print "WORKER_API_KEY="v}' .env > .env.tmp && mv .env.tmp .env
        fi
    fi
    echo "Pre-clean potential name conflicts..."
    for n in joe_browser_worker joe_mongo joe_web joe_api joe_nginx joe_certbot; do
        ids="$(docker ps -aq --filter "name=$n" 2>/dev/null || true)"
        if [ -n "${ids:-}" ]; then
            docker rm -f $ids || true
        fi
    done

    $COMPOSE -p "$PROJECT_NAME" -f "$COMPOSE_FILE" build --pull --no-cache
    $COMPOSE -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans
    WEB_CID="$($COMPOSE -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps -q web 2>/dev/null || true)"
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
