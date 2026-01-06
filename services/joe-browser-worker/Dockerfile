FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Ensure ms-playwright exists and install all browsers + deps
RUN mkdir -p /app/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/app/ms-playwright
RUN npx playwright install --with-deps chromium firefox webkit ffmpeg

# Expose port
EXPOSE 8080

# Start command
CMD ["npm", "start"]
