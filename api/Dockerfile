FROM node:22

WORKDIR /app

# Install build dependencies for node-pty (gyp) and Playwright deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    xvfb \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install deps (including node-pty compilation)
RUN npm ci

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
