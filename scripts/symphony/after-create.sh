#!/usr/bin/env sh
set -eu

git remote set-url origin https://github.com/monsieurmurdoch/malka-vrs.git
git fetch origin main
git checkout -B main origin/main

echo "Symphony workspace created for malka-vrs."
