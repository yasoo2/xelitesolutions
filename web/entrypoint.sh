#!/bin/sh

# Default values
API_URL=${VITE_API_URL:-"https://xelitesolutions.com/api"}
WS_URL=${VITE_WS_URL:-""}
FEATURE_BROWSER_CHROME=${FEATURE_BROWSER_CHROME:-${VITE_FEATURE_BROWSER_CHROME:-"0"}}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-${VITE_GOOGLE_CLIENT_ID:-""}}

# Write config.js
echo "window.JOE_CONFIG = {
  API_URL: \"$API_URL\",
  WS_URL: \"$WS_URL\",
  FEATURE_BROWSER_CHROME: \"$FEATURE_BROWSER_CHROME\",
  GOOGLE_CLIENT_ID: \"$GOOGLE_CLIENT_ID\"
};" > /usr/share/nginx/html/config.js

chmod 644 /usr/share/nginx/html/config.js

# Note: We do NOT use 'exec "$@"' here because this script is intended
# to be run by Nginx's internal entrypoint system (in /docker-entrypoint.d/),
# which will handle the final execution of nginx.
