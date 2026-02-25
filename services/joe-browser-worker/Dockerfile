FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package*.json ./

# Install npm dependencies
RUN npm install

# Playwright browsers (deps are already in the base image)
RUN npx playwright install chromium chromium-headless-shell && \
    npm cache clean --force

COPY . .

ENV NODE_OPTIONS="--max-old-space-size=6144"

# Build
RUN npm run build

EXPOSE 7070
EXPOSE 5050

CMD ["npm", "start"]
