#!/bin/bash
# Health check script - monitors all services

check_service() {
    local name=$1
    local url=$2
    
    if curl -f -s "$url" &>/dev/null; then
        echo "✅ $name: OK"
        return 0
    else
        echo "❌ $name: DOWN"
        return 1
    fi
}

echo "🏥 Joe System Health Check"
echo "=========================="

# Check MongoDB
if docker exec joe_mongo mongosh --eval "db.version()" &>/dev/null; then
    echo "✅ MongoDB: RUNNING"
else
    echo "❌ MongoDB: DOWN"
fi

# Check API
check_service "API" "http://localhost:3000/health"

# Check Browser Worker
check_service "Browser Worker" "http://localhost:5050/health"

# Check Web
check_service "Web Frontend" "http://localhost:8080"

# Docker container status
echo ""
echo "📦 Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep joe_

# Resource usage
echo ""
echo "💾 Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker ps -q -f name=joe_)
