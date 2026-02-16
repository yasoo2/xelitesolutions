FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

COPY package*.json ./

# Install npm dependencies
RUN npm install

# Playwright browsers (deps are already in the base image)
RUN npx playwright install chromium chromium-headless-shell && \
    npm cache clean --force

COPY . .

# Build
RUN npm run build

EXPOSE 7070
EXPOSE 5050

CMD ["npm", "start"]
