# Simplified Dockerfile for low-RAM VPS
# REQUIREMENT: Run "npm ci && npx vite build" on the HOST before building this image
# Docker build on 3.7GB VPS cannot run npm install/ci (OOM)

FROM nginx:alpine

# Copy pre-built frontend assets from host
COPY dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script for dynamic env vars
COPY entrypoint.sh /docker-entrypoint.d/99-config.sh
RUN chmod +x /docker-entrypoint.d/99-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
