FROM node:22-slim

WORKDIR /app

# Skip Chromium download for puppeteer as we use a dedicated browser worker
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
