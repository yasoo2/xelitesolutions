#!/bin/sh

# Default values
API_URL=${VITE_API_URL:-"https://api.xelitesolutions.com"}
WS_URL=${VITE_WS_URL:-""}

# Write config.js
echo "window.JOE_CONFIG = {
  API_URL: \"$API_URL\",
  WS_URL: \"$WS_URL\"
};" > /usr/share/nginx/html/config.js

chmod 644 /usr/share/nginx/html/config.js

# Note: We do NOT use 'exec "$@"' here because this script is intended
# to be run by Nginx's internal entrypoint system (in /docker-entrypoint.d/),
# which will handle the final execution of nginx.
