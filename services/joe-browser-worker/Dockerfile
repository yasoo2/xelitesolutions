FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm install

# Install system dependencies and Chromium matching the local package version
RUN npx playwright install --with-deps chromium

COPY . .

# Build if needed (tsconfig present)
RUN npm run build

EXPOSE 7070
EXPOSE 5050

CMD ["npm", "start"]
