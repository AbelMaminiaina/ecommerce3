#!/bin/bash

# Script pour initialiser Let's Encrypt SSL
# Usage: ./init-letsencrypt.sh

domains=(fermeduvardier.com www.fermeduvardier.com)
email="savatry.milamina@gmail.com"
staging=0 # Set to 1 for testing

data_path="./certbot"

if [ -d "$data_path/conf/live/fermeduvardier.com" ]; then
  read -p "Existing certificates found. Replace? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi

echo "### Creating required directories..."
mkdir -p "$data_path/conf"
mkdir -p "$data_path/www"

echo "### Downloading recommended TLS parameters..."
curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"

echo "### Creating dummy certificate..."
mkdir -p "$data_path/conf/live/fermeduvardier.com"
openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
  -keyout "$data_path/conf/live/fermeduvardier.com/privkey.pem" \
  -out "$data_path/conf/live/fermeduvardier.com/fullchain.pem" \
  -subj "/CN=localhost"

echo "### Starting nginx..."
docker compose -f docker-compose.prod.yml up -d nginx

echo "### Waiting for nginx to start..."
sleep 5

echo "### Deleting dummy certificate..."
rm -rf "$data_path/conf/live/fermeduvardier.com"

echo "### Requesting Let's Encrypt certificate..."

# Select staging or production
if [ $staging != "0" ]; then
  staging_arg="--staging"
else
  staging_arg=""
fi

docker compose -f docker-compose.prod.yml run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  $staging_arg \
  --email $email \
  --rsa-key-size 4096 \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d ${domains[0]} \
  -d ${domains[1]}

echo "### Reloading nginx..."
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "### Done! SSL certificate installed."
