#!/bin/bash
# Server setup script - Run once on fresh server

set -e

echo "🔧 Setting up Joe System on server..."

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    apt-get update
    apt-get install -y docker-compose
fi

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/mongo
mkdir -p certbot/conf
mkdir -p certbot/www
mkdir -p nginx/conf.d

# Generate secure secrets if .env doesn't exist
if [ ! -f .env ]; then
    echo "🔐 Generating .env with secure secrets..."
    JWT_SECRET=$(openssl rand -base64 32)
    WORKER_KEY=$(openssl rand -hex 16)
    
    cat > .env << EOF
# Auto-generated production configuration
MONGO_URI=mongodb://mongo:27017/joe
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
PORT=3000
REGISTRATION_OPEN=true
BROWSER_WS_ENDPOINT=ws://browser-worker:5050/ws
WORKER_API_KEY=${WORKER_KEY}

# IMPORTANT: Set these environment variables before running setup-server.sh
# export OPENAI_API_KEY="your-key-here"
# export GOOGLE_CLIENT_ID="your-client-id"
# export GOOGLE_CLIENT_SECRET="your-secret"

# Or copy from existing .env file on server
OPENAI_API_KEY=${OPENAI_API_KEY:-}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
EOF
    echo "✅ .env created with secure secrets"
    echo "⚠️  Remember to set OPENAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
fi

# Setup firewall
echo "🔥 Configuring firewall..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

# Setup git hook for auto-deployment
echo "🔗 Setting up auto-deployment..."
cat > .git/hooks/post-merge << 'HOOK'
#!/bin/bash
echo "🚀 Auto-deploying after git pull..."
./deploy.sh
HOOK
chmod +x .git/hooks/post-merge
chmod +x deploy.sh

echo "✅ Server setup complete!"
echo "🚀 Running initial deployment..."
./deploy.sh
