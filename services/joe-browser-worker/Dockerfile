FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Install Chromium explicitly to ensure it matches the version required
RUN npx playwright install chromium

# Expose port
EXPOSE 8080

# Start command
CMD ["npm", "start"]
