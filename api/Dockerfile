# Pre-built Dockerfile for low-RAM VPS
# REQUIREMENT: Run "npm install && npm run build && npm prune --omit=dev" on the HOST before building
FROM node:20-slim

WORKDIR /app

# Copy pre-built artifacts from host
COPY package*.json ./
COPY node_modules ./node_modules
COPY dist ./dist

# CRITICAL: Rebuild native modules for Docker's glibc (2.36)
# Host is Ubuntu (glibc 2.39) — native binaries compiled there crash with SIGBUS in Debian containers
RUN npm rebuild 2>/dev/null || true

EXPOSE 3000

# Health check using node (curl not available in slim image)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "const http = require('http'); const req = http.get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(5000, () => { req.destroy(); process.exit(1); });"

# Start application
CMD ["npm", "run", "start"]
