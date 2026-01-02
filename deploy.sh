#!/bin/bash

# Deploy script to pull latest changes and rebuild the web container
echo "Starting deployment process..."

echo "1. Pulling latest changes from git..."
git pull

echo "2. Rebuilding and restarting web container..."
# Check if docker command exists
if command -v docker &> /dev/null; then
    docker compose -f docker-compose.server.yml up -d --build web
    echo "Deployment command executed successfully."
else
    echo "Error: 'docker' command not found in this environment."
    echo "Please ensure Docker is installed and in your PATH."
    exit 1
fi
