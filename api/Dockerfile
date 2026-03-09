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

# Optimize npm for CI environment (512MB is enough for npm install on low-RAM VPS)
ENV NODE_OPTIONS="--max-old-space-size=512"

RUN npm install --include=dev --no-audit --no-fund

# Copy source code
COPY . .

# Build the application (768MB for TypeScript compilation)
ENV NODE_OPTIONS="--max-old-space-size=768"
RUN npm run build

# Prune dev dependencies to save space/memory for the next stage
RUN npm prune --omit=dev --no-audit

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies (minimal)
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    curl \
    ca-certificates \
    git && \
    curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz | tar zxvf - --strip-components=1 -C /usr/local/bin docker/docker && \
    curl -L "https://github.com/docker/compose/releases/download/v2.25.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose && \
    chmod +x /usr/local/bin/docker-compose && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files (metadata only)
COPY package*.json ./

# Copy node_modules and build artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "run", "start"]
