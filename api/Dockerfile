# Ultra-minimal Dockerfile for low-RAM VPS with dpkg issues
# REQUIREMENT: Run "npm install && npm run build && npm prune --omit=dev" on the HOST before building
FROM node:20-slim

WORKDIR /app

# Skip apt-get entirely — use node:20-slim as-is (it has bash and basic tools)
# Docker CLI is mounted from host via docker-compose volumes if needed

# Copy pre-built artifacts from host
COPY package*.json ./
COPY node_modules ./node_modules
COPY dist ./dist

EXPOSE 3000

# Health check using node instead of curl (curl may not be available)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "const http = require('http'); const req = http.get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(5000, () => { req.destroy(); process.exit(1); });"

# Start application
CMD ["npm", "run", "start"]
