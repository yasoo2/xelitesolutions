FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./

# Install system dependencies first (lightweight)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install npm dependencies
RUN npm install

# Install Playwright dependencies separately to avoid peak memory pressure
RUN npx playwright install-deps chromium && \
    npx playwright install chromium chromium-headless-shell && \
    npm cache clean --force && \
    rm -rf /var/lib/apt/lists/*

COPY . .

# Build and cleanup source maps/docs if applicable
RUN npm run build

EXPOSE 7070
EXPOSE 5050

CMD ["npm", "start"]
