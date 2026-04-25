#!/usr/bin/env bash
set -euo pipefail

mkdir -p /var/lib/postgresql/wal_archive
chown -R postgres:postgres /var/lib/postgresql/wal_archive
chmod 700 /var/lib/postgresql/wal_archive
