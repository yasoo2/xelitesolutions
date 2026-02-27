# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Set memory limits to prevent OOM kill on low-resource machines (Exit code 137)
# Lower limit forces V8 GC to run more frequently before container hard limit is hit
ENV NODE_OPTIONS="--max-old-space-size=512"

# Copy package files
COPY package*.json ./

# Optimize npm for low-memory environment
RUN npm config set maxsockets 1 && \
    npm install --no-audit --no-fund --loglevel=error

# Copy source code
COPY . .

# Accept build arguments for environment variables
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL=/api

# Set as environment variables for Vite build
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL

# Build the application
# Skipping tsc to prevent OOM (exit code 137) on constrained CI runners. Vite uses esbuild for fast bundling.
RUN npx vite build --emptyOutDir

# Stage 2: Serve
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY entrypoint.sh /docker-entrypoint.d/99-config.sh
RUN chmod +x /docker-entrypoint.d/99-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
