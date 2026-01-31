FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./

# Install prod deps and clean cache
RUN npm install && \
    npx playwright install --with-deps chromium chromium-headless-shell && \
    npm cache clean --force && \
    rm -rf /var/lib/apt/lists/*

COPY . .

# Build and cleanup source maps/docs if applicable
RUN npm run build

EXPOSE 7070
EXPOSE 5050

CMD ["npm", "start"]
