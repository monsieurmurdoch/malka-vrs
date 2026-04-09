#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MalkaVRS — DigitalOcean Droplet Setup
#
# Prerequisites:
#   - Ubuntu 22.04+ Droplet (minimum 4GB RAM / 2 vCPUs)
#   - Domain pointing to this droplet's IP (A record)
#   - SSH access as root or sudo user
#
# Usage:
#   scp -r . root@YOUR_DROPLET_IP:/opt/malka-vrs
#   ssh root@YOUR_DROPLET_IP
#   cd /opt/malka-vrs
#   cp .env.example .env && nano .env   # Fill in secrets
#   bash deploy/setup.sh
# ============================================================

DOMAIN="${DOMAIN:-}"
EMAIL="${CERTBOT_EMAIL:-}"

echo "============================================"
echo "  MalkaVRS Production Setup"
echo "============================================"

# ── Validate ──
if [ -z "$DOMAIN" ]; then
    read -rp "Enter your domain (e.g., vrs.malka.com): " DOMAIN
fi

if [ -z "$EMAIL" ]; then
    read -rp "Enter email for SSL cert notifications: " EMAIL
fi

if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.example and fill in values first."
    exit 1
fi

# Check required .env values
source .env
if [ -z "${VRS_SHARED_JWT_SECRET:-}" ]; then
    echo "ERROR: VRS_SHARED_JWT_SECRET is not set in .env"
    echo "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    exit 1
fi

if [ -z "${VRS_BOOTSTRAP_SUPERADMIN_PASSWORD:-}" ]; then
    echo "ERROR: VRS_BOOTSTRAP_SUPERADMIN_PASSWORD is not set in .env"
    exit 1
fi

# ── Install Docker if needed ──
if ! command -v docker &> /dev/null; then
    echo "[1/5] Installing Docker..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    echo "[1/5] Docker installed."
else
    echo "[1/5] Docker already installed."
fi

# ── Firewall ──
echo "[2/5] Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw allow 10000/udp # JVB WebRTC media
ufw allow 4443/tcp  # JVB fallback
ufw --force enable
echo "[2/5] Firewall configured."

# ── Write DOMAIN and IP into .env ──
DROPLET_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')
echo "[3/5] Droplet IP: $DROPLET_IP"

# Append deployment vars to .env if not already there
grep -q "^DOMAIN=" .env || echo "DOMAIN=$DOMAIN" >> .env
grep -q "^DROPLET_PUBLIC_IP=" .env || echo "DROPLET_PUBLIC_IP=$DROPLET_IP" >> .env

# ── SSL Certificate ──
echo "[4/5] Obtaining SSL certificate for $DOMAIN..."

# Start a temporary nginx to serve the ACME challenge
docker compose -f docker-compose.prod.yml up -d nginx 2>/dev/null || true

# Get the cert
docker run --rm \
    -v "$(pwd)/deploy/certbot-webroot:/var/www/certbot" \
    -v "$(pwd)/deploy/certbot-certs:/etc/letsencrypt" \
    certbot/certbot certonly \
    --webroot --webroot-path=/var/www/certbot \
    --email "$EMAIL" --agree-tos --no-eff-email \
    -d "$DOMAIN" \
    || {
        echo ""
        echo "SSL cert failed. For first-time setup, you may need to:"
        echo "  1. Temporarily comment out the HTTPS server block in deploy/nginx.conf"
        echo "  2. Run: docker compose -f docker-compose.prod.yml up -d nginx"
        echo "  3. Run certbot manually"
        echo "  4. Uncomment the HTTPS block and restart"
        echo ""
        echo "Alternatively, use the --staging flag for testing."
    }

# ── Launch everything ──
echo "[5/5] Starting MalkaVRS stack..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "============================================"
echo "  MalkaVRS is starting up!"
echo ""
echo "  Frontend:  https://$DOMAIN"
echo "  VRS API:   https://$DOMAIN/api/"
echo "  Ops Admin: https://$DOMAIN/ops/"
echo ""
echo "  Logs: docker compose -f docker-compose.prod.yml logs -f"
echo "============================================"
