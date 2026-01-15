FROM node:22-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN npx playwright install --with-deps chromium && apt-get update && apt-get install -y --no-install-recommends xvfb curl && rm -rf /var/lib/apt/lists/*

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
