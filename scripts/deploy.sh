#!/bin/bash
# Joe Deployment Script - سكربت الدبلوي المُصلح
# This script fixes the ENOENT error by using bash explicitly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_PATH="${PROJECT_ROOT:-/root/xelitesolutions}"
API_PATH="$PROJECT_PATH/api"
WEB_PATH="$PROJECT_PATH/web"
API_PORT="${API_PORT:-8080}"
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_INTERVAL=3

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check API health
check_health() {
    local retries=$1
    local interval=$2
    local url="http://localhost:$API_PORT/health"

    log_info "Checking API health at $url..."

    for i in $(seq 1 $retries); do
        if curl -s -f "$url" >/dev/null 2>&1; then
            log_info "✅ API is healthy!"
            return 0
        fi
        log_warn "Health check $i/$retries failed, retrying in ${interval}s..."
        sleep $interval
    done

    log_error "❌ API health check failed after $retries attempts"
    return 1
}

# Main deployment function
main() {
    log_info "========================================="
    log_info "🚀 Starting Joe Deployment"
    log_info "========================================="
    log_info "Project path: $PROJECT_PATH"
    log_info "API path: $API_PATH"
    log_info "Web path: $WEB_PATH"
    log_info "API port: $API_PORT"

    # Check required commands
    if ! command_exists git; then
        log_error "git is not installed"
        exit 1
    fi

    if ! command_exists npm; then
        log_error "npm is not installed"
        exit 1
    fi

    if ! command_exists node; then
        log_error "node is not installed"
        exit 1
    fi

    # Navigate to project
    cd "$PROJECT_PATH" || {
        log_error "Failed to navigate to $PROJECT_PATH"
        exit 1
    }

    # Configure git safe directory
    log_info "Configuring git safe directory..."
    git config --global --add safe.directory "$PROJECT_PATH" 2>/dev/null || true

    # Pull latest code
    log_info "📥 Pulling latest code from GitHub..."
    git fetch origin main

    LOCAL_COMMIT=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse origin/main)

    log_info "Local commit: $LOCAL_COMMIT"
    log_info "Remote commit: $REMOTE_COMMIT"

    if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
        log_info "Already up to date."
    else
        log_info "New commits detected, updating..."
        git reset --hard origin/main
        log_info "✅ Code updated to $REMOTE_COMMIT"
    fi

    # Build Web Frontend
    log_info "========================================="
    log_info "🔨 Building Web Frontend..."
    log_info "========================================="

    cd "$WEB_PATH" || {
        log_error "Failed to navigate to $WEB_PATH"
        exit 1
    }

    log_info "Installing web dependencies..."
    if npm install --legacy-peer-deps --no-audit --no-fund; then
        log_info "✅ Web dependencies installed"
    else
        log_warn "⚠️ Web npm install had issues, continuing..."
    fi

    log_info "Building web frontend..."
    if npm run build; then
        log_info "✅ Web frontend built successfully"
    else
        log_warn "⚠️ Web build failed, continuing with API..."
    fi

    # Build API
    log_info "========================================="
    log_info "🔨 Building API..."
    log_info "========================================="

    cd "$API_PATH" || {
        log_error "Failed to navigate to $API_PATH"
        exit 1
    }

    log_info "Installing API dependencies..."
    rm -rf node_modules package-lock.json
    if npm install --legacy-peer-deps --no-audit --no-fund; then
        log_info "✅ API dependencies installed"
    else
        log_error "❌ Failed to install API dependencies"
        exit 1
    fi

    log_info "Building API..."
    if npm run build; then
        log_info "✅ API built successfully"
    else
        log_warn "⚠️ npm run build failed, trying tsc directly..."
        if npx tsc; then
            log_info "✅ API built with tsc"
        else
            log_error "❌ API build failed"
            exit 1
        fi
    fi

    # Restart API Server
    log_info "========================================="
    log_info "🔄 Restarting API Server..."
    log_info "========================================="

    log_info "Stopping existing API server..."
    npx pm2 stop joe-api 2>/dev/null || true
    sleep 2

    log_info "Starting new API server..."
    npx pm2 start ecosystem.config.js
    log_info "API server managed by PM2"

    # Wait for server to start
    log_info "Waiting for server to start..."
    sleep 5

    # Health check
    if check_health $HEALTH_CHECK_RETRIES $HEALTH_CHECK_INTERVAL; then
        log_info "========================================="
        log_info "✅ Deployment completed successfully!"
        log_info "========================================="
        log_info "API Logs: npx pm2 logs joe-api"

        # Save last stable commit
        echo "$REMOTE_COMMIT" > "$PROJECT_PATH/last_stable_commit"

        exit 0
    else
        log_error "========================================="
        log_error "❌ Deployment failed - API health check failed"
        log_error "========================================="
        log_error "Check logs: npx pm2 logs joe-api"

        exit 1
    fi
}

# Handle rollback
rollback() {
    log_info "========================================="
    log_info "🔄 Rolling back to last stable commit..."
    log_info "========================================="

    cd "$PROJECT_PATH" || exit 1

    if [ -f "$PROJECT_PATH/last_stable_commit" ]; then
        STABLE_COMMIT=$(cat "$PROJECT_PATH/last_stable_commit")
        log_info "Rolling back to: $STABLE_COMMIT"

        git reset --hard "$STABLE_COMMIT"

        cd "$API_PATH"
        npm install --legacy-peer-deps
        npm run build

        npx pm2 stop joe-api 2>/dev/null || true
        sleep 2
        npx pm2 start ecosystem.config.js

        log_info "✅ Rollback completed"
    else
        log_error "No stable commit file found"
        exit 1
    fi
}

# Show help
show_help() {
    echo "Joe Deployment Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  deploy    Deploy the latest code (default)"
    echo "  rollback  Rollback to last stable commit"
    echo "  help      Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  PROJECT_ROOT    Project root path (default: /root/xelitesolutions)"
    echo "  API_PORT        API server port (default: 8080)"
}

# Main entry point
case "${1:-deploy}" in
    deploy)
        main
        ;;
    rollback)
        rollback
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
