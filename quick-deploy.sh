#!/bin/bash
# Quick Deploy Script for Joe Enterprise
# Run this on the server to manually deploy latest code

echo "🚀 Joe Enterprise - Quick Deploy"
echo "================================"

PROJECT_PATH="/root/xelitesolutions"
API_PATH="$PROJECT_PATH/api"

cd "$PROJECT_PATH" || exit 1

echo "📥 Pulling latest code..."
git fetch origin main
git reset --hard origin/main

echo "🔨 Building API..."
cd "$API_PATH"
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps --no-audit --no-fund
npm run build || npx tsc

echo "🔄 Restarting server..."
npx pm2 stop joe-api 2>/dev/null || true
sleep 2
npx pm2 start ecosystem.config.js

echo "✅ Deployment initiated via PM2!"
echo "📊 Checking health..."
RETRIES=10
INTERVAL=2

for i in $(seq 1 $RETRIES); do
    if curl -s -f "http://localhost:8080/health" >/dev/null 2>&1; then
        echo "✅ Health check passed!"
        echo ""
        echo "📋 View logs: npx pm2 logs joe-api"
        exit 0
    fi
    echo "⚠️ Waiting for server... ($i/$RETRIES)"
    sleep $INTERVAL
done

echo "❌ Health check failed after $RETRIES attempts."
echo "📋 View logs: npx pm2 logs joe-api"
exit 1
