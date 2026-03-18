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
npm run build || npx tsc --skipLibCheck

echo "🔄 Restarting server..."
pkill -f "node.*dist/index.js" 2>/dev/null || true
sleep 2
nohup node dist/index.js > /tmp/api.log 2>&1 &

echo "✅ Deployment complete!"
echo "📊 Checking health..."
sleep 3
curl -s http://localhost:8080/health && echo "" || echo "⚠️ Health check failed"
echo ""
echo "📋 View logs: tail -f /tmp/api.log"
