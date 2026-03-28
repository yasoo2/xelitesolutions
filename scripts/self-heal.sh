#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Joe Enterprise - Self-Healing Deployment System
# نظام دبلوي ذاتي الإصلاح - يعمل تلقائياً
# ═══════════════════════════════════════════════════════════════════

# This script is designed to be run automatically by the system
# It will detect and fix deployment issues

PROJECT_PATH="/root/xelitesolutions"
API_PATH="$PROJECT_PATH/api"
LOCK_FILE="/tmp/joe-deploy.lock"
LOG_FILE="/tmp/joe-self-heal.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if ps -p "$LOCK_PID" > /dev/null 2>&1; then
        log "Deployment already in progress (PID: $LOCK_PID)"
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"

# Cleanup on exit
trap 'rm -f "$LOCK_FILE"' EXIT

log "═══════════════════════════════════════════════════════════"
log "🔄 Self-Healing Deployment Started"
log "═══════════════════════════════════════════════════════════"

cd "$PROJECT_PATH" || exit 1

# Get commits
LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
git fetch origin main --force 2>/dev/null
REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "unknown")

log "Local: ${LOCAL_COMMIT:0:7} | Remote: ${REMOTE_COMMIT:0:7}"

# Check if update is needed
if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    log "Already up to date, checking server health..."

    # Check if server is running
    if curl -s http://localhost:8080/health >/dev/null 2>&1; then
        log "✅ Server is healthy"
        exit 0
    else
        log "⚠️ Server is not responding, will restart..."
    fi
else
    log "📥 Update available: ${LOCAL_COMMIT:0:7} -> ${REMOTE_COMMIT:0:7}"
fi

# Update code
log "Updating code..."
git config --global --add safe.directory "$PROJECT_PATH" 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || {
    log "❌ Git reset failed, trying alternative..."
    git checkout main 2>/dev/null || true
    git pull origin main --force 2>/dev/null || true
}

# Build API
log "🔨 Building API..."
cd "$API_PATH"

# Load NVM to ensure right node version
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install dependencies
log "Installing dependencies..."
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tee -a "$LOG_FILE" || {
    log "⚠️ npm install had issues, continuing..."
}

# Build
log "Compiling TypeScript..."
npx tsc 2>&1 | tee -a "$LOG_FILE" || {
    log "❌ tsc build failed"
    exit 1
}

# Check if build succeeded
if [ ! -d "$API_PATH/dist" ]; then
    log "❌ Build failed - no dist folder"
    exit 1
fi

# Stop old server
log "🔄 Stopping old server..."
npx pm2 stop joe-api 2>/dev/null || true
sleep 3

# Start new server
log "🚀 Starting new server..."
cd "$API_PATH"
export NODE_ENV=production
export PORT=8080

npx pm2 start ecosystem.config.js
log "Server managed by PM2"

# Wait and verify
sleep 5

for i in 1 2 3 4 5; do
    if curl -s http://localhost:8080/health >/dev/null 2>&1; then
        log "✅ Server is healthy!"
        echo "$REMOTE_COMMIT" > "$PROJECT_PATH/last_stable_commit"
        log "═══════════════════════════════════════════════════════════"
        log "🎉 Self-Healing Deployment Complete!"
        log "═══════════════════════════════════════════════════════════"
        exit 0
    fi
    log "Health check $i/5 failed, retrying..."
    sleep 2
done

log "❌ Health check failed"
exit 1
