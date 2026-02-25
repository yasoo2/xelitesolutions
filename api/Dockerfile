FROM node:20-alpine

# Install Python, Git, bash and build dependencies for native modules
RUN apk add --no-cache python3 make g++ py3-pip git bash curl linux-headers

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --include=dev && npm cache clean --force

# Copy source code
COPY . .

ENV NODE_OPTIONS="--max-old-space-size=8192"

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "run", "start"]
