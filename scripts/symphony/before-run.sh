#!/usr/bin/env sh
set -eu

git fetch origin main

if [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ]; then
    git pull --ff-only origin main
fi

if [ ! -d node_modules ]; then
    npm ci
fi

if [ ! -d vrs-server/node_modules ]; then
    npm --prefix vrs-server ci
fi

if [ ! -d vrs-ops-server/node_modules ]; then
    npm --prefix vrs-ops-server ci
fi

echo "Symphony workspace ready."
