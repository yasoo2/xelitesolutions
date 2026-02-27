# Stage 1: Builder
FROM node:20-slim AS builder

# Install build dependencies optimized for low-memory CI runners
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    bash \
    curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Optimize npm for CI environment
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN npm install --include=dev --no-audit --no-fund

# Copy source code
COPY . .

# Build the application
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Copy package files for production install
COPY package*.json ./

# Install runtime dependencies (python and build tools needed for node-pty postinstall)
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    bash \
    curl \
    ca-certificates \
    git && \
    npm install --omit=dev --no-audit --no-fund && \
    npx playwright install --with-deps chromium && \
    apt-get purge -y --auto-remove make g++ python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm cache clean --force

# Copy build artifacts
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "run", "start"]
