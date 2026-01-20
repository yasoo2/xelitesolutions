#!/bin/bash
# Auto-deployment script for Joe System
# This runs on the server when code is pulled from GitHub

set -e  # Exit on any error

echo "🚀 Joe Auto-Deployment Started..."

# Navigate to project directory
cd /opt/joe || cd /var/www/joe || cd "$(dirname "$0")"

echo "📦 Pulling latest code..."
git pull origin main

echo "🐳 Starting Docker services..."

# Stop old containers gracefully
docker-compose -f docker-compose.server.yml down

# Remove old images (optional - uncomment if needed)
# docker-compose -f docker-compose.server.yml down --rmi local

# Build and start all services
docker-compose -f docker-compose.server.yml up -d --build

echo "⏳ Waiting for services to start..."
sleep 10

# Health checks
echo "🔍 Running health checks..."

# Check MongoDB
if docker exec joe_mongo mongosh --eval "db.version()" &>/dev/null; then
    echo "✅ MongoDB: Running"
else
    echo "❌ MongoDB: Failed"
fi

# Check API
if curl -f http://localhost:3000/health &>/dev/null; then
    echo "✅ API: Running"
else
    echo "❌ API: Failed"
fi

# Check Browser Worker
if curl -f http://localhost:5050/health &>/dev/null; then
    echo "✅ Browser Worker: Running"
else
    echo "⚠️  Browser Worker: Not responding (may take longer to start)"
fi

echo "📊 Active containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "✅ Deployment completed!"
echo "🌍 System is now live!"
