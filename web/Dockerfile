# Stage 2: Serve (Build stage skipped due to server memory constraints)
FROM nginx:alpine

# Copy built assets from local machine (scp-ed to server)
COPY dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script for dynamic env vars
COPY entrypoint.sh /docker-entrypoint.d/99-config.sh
RUN chmod +x /docker-entrypoint.d/99-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
