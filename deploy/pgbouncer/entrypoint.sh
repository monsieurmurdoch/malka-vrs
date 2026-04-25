#!/usr/bin/env bash
set -euo pipefail

PGBOUNCER_LISTEN_PORT="${PGBOUNCER_LISTEN_PORT:-6432}"
PGBOUNCER_POOL_MODE="${PGBOUNCER_POOL_MODE:-transaction}"
PGBOUNCER_MAX_CLIENT_CONN="${PGBOUNCER_MAX_CLIENT_CONN:-200}"
PGBOUNCER_DEFAULT_POOL_SIZE="${PGBOUNCER_DEFAULT_POOL_SIZE:-25}"
PGBOUNCER_RESERVE_POOL_SIZE="${PGBOUNCER_RESERVE_POOL_SIZE:-5}"
PGBOUNCER_POSTGRES_HOST="${PGBOUNCER_POSTGRES_HOST:-postgres}"
PGBOUNCER_POSTGRES_PORT="${PGBOUNCER_POSTGRES_PORT:-5432}"
PGDATABASE="${PGDATABASE:-malka_vrs}"
PGUSER="${PGUSER:-malka}"
PGPASSWORD="${PGPASSWORD:-malka}"

mkdir -p /etc/pgbouncer /var/log/pgbouncer /var/run/pgbouncer

cat > /etc/pgbouncer/userlist.txt <<EOF
"${PGUSER}" "${PGPASSWORD}"
EOF

cat > /etc/pgbouncer/pgbouncer.ini <<EOF
[databases]
${PGDATABASE} = host=${PGBOUNCER_POSTGRES_HOST} port=${PGBOUNCER_POSTGRES_PORT} dbname=${PGDATABASE}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = ${PGBOUNCER_LISTEN_PORT}
auth_type = plain
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = ${PGBOUNCER_POOL_MODE}
max_client_conn = ${PGBOUNCER_MAX_CLIENT_CONN}
default_pool_size = ${PGBOUNCER_DEFAULT_POOL_SIZE}
reserve_pool_size = ${PGBOUNCER_RESERVE_POOL_SIZE}
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits
log_connections = 1
log_disconnections = 1
admin_users = ${PGUSER}
stats_users = ${PGUSER}
EOF

chown -R nobody:nobody /etc/pgbouncer /var/log/pgbouncer /var/run/pgbouncer

exec pgbouncer -u nobody /etc/pgbouncer/pgbouncer.ini
