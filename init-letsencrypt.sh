#!/bin/bash
set -e

# Determine docker compose command
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo 'Error: docker compose is not installed.' >&2
  exit 1
fi

domains=(xelitesolutions.com www.xelitesolutions.com api.xelitesolutions.com ws.xelitesolutions.com browser.xelitesolutions.com)
primary_domain="xelitesolutions.com"
rsa_key_size=4096
data_path="${CERTBOT_DATA_PATH:-/opt/joe/certbot}"
email="admin@xelitesolutions.com" # Change this to your email
staging=0 # Set to 1 if you're testing your setup to avoid hitting request limits

PROJECT_NAME="${PROJECT_NAME:-joe}"
if [ -n "${COMPOSE_FILE:-}" ]; then
  :
elif [ -f docker-compose.production.yml ]; then
  COMPOSE_FILE="docker-compose.production.yml"
elif [ -f docker-compose.server.yml ]; then
  COMPOSE_FILE="docker-compose.server.yml"
elif [ -f docker-compose.yml ]; then
  COMPOSE_FILE="docker-compose.yml"
else
  echo "No docker-compose file found in $(pwd)" >&2
  exit 1
fi

if [ -d "$data_path" ]; then
#  read -p "Existing data found for $domains. Continue and replace existing certificate? (y/N) " decision
#  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
#    exit
#  fi
   echo "Existing data found. Proceeding automatically..."
fi

if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  echo "### Downloading recommended TLS parameters ..."
  mkdir -p "$data_path/conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
  echo
fi

echo "### Creating dummy certificate for $domains ..."
path="/etc/letsencrypt/live/$primary_domain"
mkdir -p "$data_path/conf/live/$primary_domain"
$COMPOSE -p "$PROJECT_NAME" -f "$COMPOSE_FILE" run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1\
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo


echo "### Starting nginx ..."
$COMPOSE -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up --force-recreate -d nginx
echo

echo "### Deleting dummy certificate for $domains ..."
$COMPOSE -p "$PROJECT_NAME" -f "$COMPOSE_FILE" run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$primary_domain && \
  rm -Rf /etc/letsencrypt/archive/$primary_domain && \
  rm -Rf /etc/letsencrypt/renewal/$primary_domain.conf" certbot
echo


echo "### Requesting Let's Encrypt certificate for $domains ..."
#Join $domains to -d args
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
case "$email" in
  "") email_arg="--register-unsafely-without-email" ;;
  *) email_arg="-m $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

$COMPOSE -p "$PROJECT_NAME" -f "$COMPOSE_FILE" run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot
echo

echo "### Reloading nginx ..."
$COMPOSE -p "$PROJECT_NAME" -f "$COMPOSE_FILE" exec nginx nginx -s reload
