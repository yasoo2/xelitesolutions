# Stage 1: Build the frontend
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (for better Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code and build
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npx vite build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script for dynamic env vars
COPY entrypoint.sh /docker-entrypoint.d/99-config.sh
RUN chmod +x /docker-entrypoint.d/99-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
