#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MalkaVRS — Quick Test Deployment (HTTP only, no domain)
#
# Run on the droplet:
#   cd /opt/malka-vrs
#   bash deploy/setup-test.sh
#
# Then visit: http://138.197.121.127
# ============================================================

DROPLET_IP="138.197.121.127"

echo "============================================"
echo "  MalkaVRS Test Deployment"
echo "  Target: http://$DROPLET_IP"
echo "============================================"

# ── Validate .env ──
if [ ! -f .env ]; then
    echo "[setup] Creating .env from template..."
    cp .env.example .env

    # Generate JWT secret
    JWT_SECRET=$(openssl rand -hex 48)
    sed -i "s/^VRS_SHARED_JWT_SECRET=$/VRS_SHARED_JWT_SECRET=$JWT_SECRET/" .env

    # Set superadmin password
    sed -i "s/^VRS_BOOTSTRAP_SUPERADMIN_PASSWORD=$/VRS_BOOTSTRAP_SUPERADMIN_PASSWORD=MalkaTest2026!/" .env

    # Set production values
    sed -i "s/^NODE_ENV=development$/NODE_ENV=production/" .env

    # Add droplet IP
    echo "" >> .env
    echo "DROPLET_PUBLIC_IP=$DROPLET_IP" >> .env

    # Set CORS for the IP
    sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://$DROPLET_IP,http://$DROPLET_IP:3001,http://$DROPLET_IP:3003|" .env

    echo "[setup] .env created. JWT secret generated."
    echo "[setup] Superadmin password: MalkaTest2026!  (change this!)"
else
    echo "[setup] .env already exists."
    # Ensure DROPLET_PUBLIC_IP is set
    grep -q "^DROPLET_PUBLIC_IP=" .env || echo "DROPLET_PUBLIC_IP=$DROPLET_IP" >> .env
fi

# ── Install Docker if needed ──
if ! command -v docker &> /dev/null; then
    echo "[1/3] Installing Docker..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    echo "[1/3] Docker installed."
else
    echo "[1/3] Docker already installed."
fi

# ── Firewall ──
echo "[2/3] Configuring firewall..."
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 10000/udp  # JVB WebRTC media
ufw allow 4443/tcp   # JVB fallback
ufw --force enable
echo "[2/3] Firewall configured."

# ── Launch ──
echo "[3/3] Building and starting MalkaVRS..."
docker compose -f docker-compose.test.yml up -d --build

echo ""
echo "============================================"
echo "  MalkaVRS is starting!"
echo ""
echo "  Frontend:  http://$DROPLET_IP"
echo "  VRS API:   http://$DROPLET_IP/api/"
echo "  Ops Admin: http://$DROPLET_IP/ops/"
echo ""
echo "  Superadmin login:"
echo "    Username: superadmin"
echo "    Password: MalkaTest2026!"
echo ""
echo "  Demo accounts:"
echo "    Client: nataly.malka@gmail.com / demo123"
echo "    Client: devin.currie@gmail.com / demo123"
echo "    Interpreter: interpreter1@malka-vrs.com / interp123"
echo "    Interpreter: interpreter2@malka-vrs.com / interp123"
echo ""
echo "  Logs:  docker compose -f docker-compose.test.yml logs -f"
echo "  Stop:  docker compose -f docker-compose.test.yml down"
echo "============================================"
