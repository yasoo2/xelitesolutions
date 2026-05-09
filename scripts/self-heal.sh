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

# Main logic
FORCE_DEPLOY=false
if [ "$1" = "deploy" ]; then
    FORCE_DEPLOY=true
fi

# Check if update is needed
if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ] && [ "$FORCE_DEPLOY" = "false" ]; then
    log "Already up to date, checking server health..."

    # Check if server is running on port 8080
    if curl -s http://localhost:8080/api/health >/dev/null 2>&1; then
        log "✅ Server is healthy"
        exit 0
    else
        log "⚠️ Server is not responding, will restart..."
    fi
else
    log "📥 Deployment triggered: ${LOCAL_COMMIT:0:7} -> ${REMOTE_COMMIT:0:7} (Force: $FORCE_DEPLOY)"
fi

# Update code
log "Updating code..."
git config --global --add safe.directory "$PROJECT_PATH" 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || {
    log "❌ Git reset failed, trying alternative..."
    git checkout main 2>/dev/null || true
    git pull origin main --force 2>/dev/null || true
}

# Build Web Frontend (NEW)
log "========================================="
log "🔨 Building Web Frontend..."
log "========================================="
cd "$PROJECT_PATH/web"
log "Installing web dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tee -a "$LOG_FILE" || log "⚠️ Web install issues"
log "Building web..."
npm run build 2>&1 | tee -a "$LOG_FILE" || log "⚠️ Web build issues"

# Build API
log "========================================="
log "🔨 Building API..."
log "========================================="
cd "$API_PATH"

# Load NVM to ensure right node version
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install dependencies
log "Installing API dependencies..."
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tee -a "$LOG_FILE" || {
    log "⚠️ API npm install had issues, continuing..."
}

# Build
log "Compiling TypeScript..."
npx tsc 2>&1 | tee -a "$LOG_FILE" || {
    log "❌ tsc build failed"
    # Try alternate build if tsc fails
    npm run build 2>&1 | tee -a "$LOG_FILE" || log "⚠️ Alternate build failed"
}

# Stop old server
log "🔄 Restarting server via PM2..."
cd "$API_PATH"
# Ensure PM2 is in path
export PATH="$PATH:$(npm bin -g):$HOME/.nvm/versions/node/v20.11.1/bin"

npx pm2 restart joe-api --update-env || {
    log "⚠️ PM2 restart failed, trying to start fresh..."
    npx pm2 start ecosystem.config.js --env production
}
log "Server managed by PM2"

# Wait and verify
sleep 10

for i in 1 2 3 4 5; do
    if curl -s http://localhost:8080/api/health >/dev/null 2>&1; then
        log "✅ Server is healthy!"
        echo "$REMOTE_COMMIT" > "$PROJECT_PATH/last_stable_commit"
        log "═══════════════════════════════════════════════════════════"
        log "🎉 Deployment Complete!"
        log "═══════════════════════════════════════════════════════════"
        exit 0
    fi
    log "Health check $i/5 failed (port 8080), retrying..."
    sleep 5
done

log "❌ Health check failed"
exit 1
