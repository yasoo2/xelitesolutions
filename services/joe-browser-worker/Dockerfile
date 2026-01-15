FROM node:20-bookworm

WORKDIR /app

# Install dependencies for Playwright
RUN npm install -g playwright

# Install system dependencies
RUN npx playwright install --with-deps chromium

COPY package*.json ./
RUN npm install

COPY . .

# Build if needed (tsconfig present)
RUN npm run build

EXPOSE 7070

CMD ["npm", "start"]
