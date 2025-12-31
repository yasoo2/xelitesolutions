#!/bin/sh

# Default values
API_URL=${VITE_API_URL:-"https://api.xelitesolutions.com"}
WS_URL=${VITE_WS_URL:-""}

# Write config.js
echo "window.JOE_CONFIG = {
  API_URL: \"$API_URL\",
  WS_URL: \"$WS_URL\"
};" > /usr/share/nginx/html/config.js

# Execute the passed command (nginx)
exec "$@"
