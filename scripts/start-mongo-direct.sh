#!/bin/bash
# Direct SSH commands to start MongoDB on remote server

sshpass -p "Younes.sowady2011" ssh -o StrictHostKeyChecking=no root@46.224.187.142 << 'ENDSSH'
# Check Docker
echo "=== Checking Docker ==="
docker --version

# Stop and remove old MongoDB container
echo "=== Removing old container ==="
docker stop mongodb 2>/dev/null || true
docker rm mongodb 2>/dev/null || true

# Start new MongoDB container
echo "=== Starting MongoDB container ==="
docker run -d \
  --name mongodb \
  --restart always \
  -p 27017:27017 \
  -v mongodb_data:/data/db \
  mongo:7.0

# Wait for container to start
sleep 5

# Check container status
echo "=== Container status ==="
docker ps | grep mongodb

# Check MongoDB logs
echo "=== MongoDB logs ==="
docker logs mongodb 2>&1 | tail -20

echo "=== Done! ==="
ENDSSH
