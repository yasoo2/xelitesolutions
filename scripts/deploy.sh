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

    if [ -f docker-compose.production.yml ]; then
        COMPOSE_FILE="docker-compose.production.yml"
    elif [ -f docker-compose.server.yml ]; then
        COMPOSE_FILE="docker-compose.server.yml"
    elif [ -f docker-compose.yml ]; then
        COMPOSE_FILE="docker-compose.yml"
    else
        echo "No docker-compose file found in $(pwd)" && exit 1
    fi

    echo "Using compose: $COMPOSE -p $PROJECT_NAME -f $COMPOSE_FILE"
    OPT_API_ENV="/opt/joe/env/api.env"
    OPT_WEB_ENV="/opt/joe/env/web.env"

    if [ ! -f .env ] && [ -f "$OPT_API_ENV" ]; then
        cp "$OPT_API_ENV" .env
    fi

    read_env_val() {
        local file="$1"
        local key="$2"
        if [ ! -f "$file" ]; then
            echo ""
            return 0
        fi
        local line
        line="$(grep -E "^${key}=" "$file" | head -n 1 || true)"
        if [ -z "${line:-}" ]; then
            echo ""
            return 0
        fi
        echo "${line#${key}=}" | tr -d '\r'
    }

    ensure_env_key() {
        local key="$1"
        local value="$2"
        if [ -z "${value:-}" ]; then
            return 0
        fi
        awk -v k="$key" -v v="$value" 'BEGIN{found=0} $0 ~ "^"k"=" {print k"="v; found=1; next} {print} END{if(!found) print k"="v}' .env > .env.tmp && mv .env.tmp .env
    }

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

        GOOGLE_ID_LINE="$(grep -E '^GOOGLE_CLIENT_ID=' .env | head -n 1 || true)"
        GOOGLE_ID_VAL="${GOOGLE_ID_LINE#GOOGLE_CLIENT_ID=}"
        if [ -z "${GOOGLE_ID_VAL:-}" ]; then
            GOOGLE_ID_VAL="$(read_env_val "$OPT_API_ENV" "GOOGLE_CLIENT_ID")"
        fi
        if [ -z "${GOOGLE_ID_VAL:-}" ]; then
            GOOGLE_ID_VAL="$(read_env_val "$OPT_WEB_ENV" "GOOGLE_CLIENT_ID")"
        fi
        if [ -z "${GOOGLE_ID_VAL:-}" ]; then
            GOOGLE_ID_VAL="$(read_env_val "$OPT_API_ENV" "VITE_GOOGLE_CLIENT_ID")"
        fi
        if [ -z "${GOOGLE_ID_VAL:-}" ]; then
            GOOGLE_ID_VAL="$(read_env_val "$OPT_WEB_ENV" "VITE_GOOGLE_CLIENT_ID")"
        fi
        ensure_env_key "GOOGLE_CLIENT_ID" "$GOOGLE_ID_VAL"

        GOOGLE_SECRET_LINE="$(grep -E '^GOOGLE_CLIENT_SECRET=' .env | head -n 1 || true)"
        GOOGLE_SECRET_VAL="${GOOGLE_SECRET_LINE#GOOGLE_CLIENT_SECRET=}"
        if [ -z "${GOOGLE_SECRET_VAL:-}" ]; then
            GOOGLE_SECRET_VAL="$(read_env_val "$OPT_API_ENV" "GOOGLE_CLIENT_SECRET")"
        fi
        if [ -z "${GOOGLE_SECRET_VAL:-}" ]; then
            GOOGLE_SECRET_VAL="$(read_env_val "$OPT_API_ENV" "GOOGLE_OAUTH_CLIENT_SECRET")"
        fi
        ensure_env_key "GOOGLE_CLIENT_SECRET" "$GOOGLE_SECRET_VAL"

        GOOGLE_ID_LINE="$(grep -E '^GOOGLE_CLIENT_ID=' .env | head -n 1 || true)"
        GOOGLE_ID_VAL="${GOOGLE_ID_LINE#GOOGLE_CLIENT_ID=}"
        GOOGLE_SECRET_LINE="$(grep -E '^GOOGLE_CLIENT_SECRET=' .env | head -n 1 || true)"
        GOOGLE_SECRET_VAL="${GOOGLE_SECRET_LINE#GOOGLE_CLIENT_SECRET=}"
        if [ -z "${GOOGLE_ID_VAL:-}" ] || [ -z "${GOOGLE_SECRET_VAL:-}" ]; then
            echo "Warning: Google OAuth غير مضبوط (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET). سيتم إكمال النشر لكن تسجيل Google قد لا يعمل."
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
