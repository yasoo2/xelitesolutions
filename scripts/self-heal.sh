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
git fetch origin main --force 2>/dev/null
git reset --hard origin/main 2>/dev/null

# Check if dependencies changed
if ! git diff --name-only HEAD@{1} HEAD | grep -q "package.json"; then
    log "Dependencies unchanged, skipping npm install"
else
    log "Dependencies changed, running npm install..."
    cd "$API_PATH"
    npm install --legacy-peer-deps --no-audit --no-fund --production || log "⚠️ npm install issues"
fi

# Build API
log "🔨 Building API (fast mode)..."
cd "$API_PATH"
# Use pre-built files if they exist, or run a quick tsc
if [ -d "dist" ]; then
    log "Found existing dist, attempting fast build..."
fi
npm run build || npx tsc --skipLibCheck || log "⚠️ Build had issues"

# RESTART LOGIC (NUCLEAR OPTION)
log "☢️ TRIGGERING NUCLEAR RESTART..."
# Kill all node processes running the API
pkill -9 -f "node.*dist/index.js" || true
pkill -9 -f "node.*api/index.js" || true

# If using PM2, it will auto-restart. If using Systemd with Restart=always, it will auto-restart.
# We also try to start it just in case
cd "$API_PATH"
export PATH="$PATH:$(npm bin -g):$HOME/.nvm/versions/node/v20.11.1/bin"
npx pm2 start ecosystem.config.js || nohup node dist/index.js > /tmp/joe-api.log 2>&1 &

log "🎉 Deployment logic finished"
exit 0
