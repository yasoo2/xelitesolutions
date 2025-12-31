# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm ci

COPY . .

# Build the app
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Install envsubst (if needed, but we use shell script)
# RUN apk add --no-cache gettext

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY entrypoint.sh /docker-entrypoint.d/99-config.sh
RUN chmod +x /docker-entrypoint.d/99-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
