#!/bin/bash
# ============================================================
# start-local.sh — Boot all MalkaVRS services for local dev
#
# Usage:
#   cp .env.example .env   # fill in secrets first
#   ./start-local.sh
#
# This starts (without Docker):
#   - VRS main server     → http://localhost:3001
#   - VRS ops server      → http://localhost:3003
#   - Twilio voice server → http://localhost:3002  (if creds set)
#   - Webpack dev server  → https://localhost:8080
# ============================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# ── Load .env ─────────────────────────────────────────────
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
else
    echo "ERROR: No .env file found."
    echo "  cp .env.example .env   # then fill in the values"
    exit 1
fi

# ── Validate required vars ────────────────────────────────
if [ -z "$VRS_SHARED_JWT_SECRET" ]; then
    echo "ERROR: VRS_SHARED_JWT_SECRET is not set in .env"
    echo "  Generate one:  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    exit 1
fi

if [ -z "$VRS_BOOTSTRAP_SUPERADMIN_PASSWORD" ]; then
    echo "ERROR: VRS_BOOTSTRAP_SUPERADMIN_PASSWORD is not set in .env"
    exit 1
fi

# ── PID tracking for cleanup ─────────────────────────────
PIDS=()

cleanup() {
    echo ""
    echo "Stopping all services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo "All services stopped."
    exit 0
}
trap cleanup INT TERM

# ── Install deps if needed ────────────────────────────────
install_if_needed() {
    local dir="$1"
    if [ -f "$dir/package.json" ] && [ ! -d "$dir/node_modules" ]; then
        echo "Installing dependencies in $dir ..."
        (cd "$dir" && npm install --no-audit --no-fund)
    fi
}

install_if_needed "$ROOT_DIR"
install_if_needed "$ROOT_DIR/vrs-server"
install_if_needed "$ROOT_DIR/vrs-ops-server"
install_if_needed "$ROOT_DIR/twilio-voice-server"

# ── Start VRS Main Server (port 3001) ────────────────────
echo "Starting VRS main server on :${PORT:-3001} ..."
(cd "$ROOT_DIR/vrs-server" && node server.js) &
PIDS+=($!)

# ── Start VRS Ops Server (port 3003) ─────────────────────
echo "Starting VRS ops server on :${OPS_PORT:-3003} ..."
if [ -d "$ROOT_DIR/vrs-ops-server/dist" ]; then
    (cd "$ROOT_DIR/vrs-ops-server" && node dist/index.js) &
else
    echo "  (compiling TypeScript first...)"
    (cd "$ROOT_DIR/vrs-ops-server" && npx ts-node-dev --respawn src/index.ts) &
fi
PIDS+=($!)

# ── Start Twilio Voice Server (port 3002) — optional ─────
if [ -z "$TWILIO_ACCOUNT_SID" ] || [ "$TWILIO_ACCOUNT_SID" = "YOUR_ACCOUNT_SID" ]; then
    echo "ERROR: TWILIO_ACCOUNT_SID is not set in .env"
    echo "  Phone features require a real Twilio account."
    exit 1
fi

if [ -z "$TWILIO_AUTH_TOKEN" ] || [ "$TWILIO_AUTH_TOKEN" = "YOUR_AUTH_TOKEN" ]; then
    echo "ERROR: TWILIO_AUTH_TOKEN is not set in .env"
    exit 1
fi

echo "Starting Twilio voice server on :${TWILIO_PORT:-3002} ..."
(cd "$ROOT_DIR/twilio-voice-server" && node server.js) &
PIDS+=($!)

# ── Wait for backends to be ready ────────────────────────
sleep 2

# ── Start Webpack Dev Server (port 8080) ─────────────────
echo "Starting webpack dev server on :8080 ..."
echo ""
make dev &
PIDS+=($!)

echo ""
echo "============================================"
echo "  MalkaVRS Local Dev Stack"
echo "============================================"
echo "  Frontend:   https://localhost:8080"
echo "  VRS API:    http://localhost:${PORT:-3001}"
echo "  Ops/Admin:  http://localhost:${OPS_PORT:-3003}"
echo "  Twilio:     http://localhost:${TWILIO_PORT:-3002}"
echo ""
echo "  Admin login: http://localhost:8080/vrs-admin.html"
echo "  Health:      http://localhost:${PORT:-3001}/health"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Wait for any child to exit
wait
