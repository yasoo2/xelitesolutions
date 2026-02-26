# Stage 1: Builder
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git bash curl linux-headers

WORKDIR /app

# Copy package files
COPY package*.json ./

# Optimize npm for low-memory environment
RUN npm config set maxsockets 1 && \
    npm install --include=dev --no-audit --no-fund --loglevel=error

# Copy source code
COPY . .

# Build the application
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

# Install runtime dependencies (curl and bash for healthcheck/scripts)
RUN apk add --no-cache bash curl

WORKDIR /app

# Copy package files for production install
COPY package*.json ./

# Install only production dependencies
RUN npm config set maxsockets 1 && \
    npm install --omit=dev --no-audit --no-fund --loglevel=error && \
    npm cache clean --force

# Copy build artifacts and necessary runtime files
COPY --from=builder /app/dist ./dist
# If you have other runtime assets (e.g. data seeds, etc. copy them here)
# COPY --from=builder /app/data ./data

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "run", "start"]
