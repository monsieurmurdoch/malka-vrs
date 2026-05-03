# Production-Like Staging Environment

Staging is the rehearsal lane for Maple VRI pilot, Malka VRI beta, Malka VRS
beta, and mobile beta. It should be boring, isolated, and easy to reset.

## Target Shape

- Separate Docker Compose project: `malka-vrs-staging`
- Separate PostgreSQL database and Docker volumes:
  - `malka_vrs_staging`
  - `pg-staging-data`
  - `pg-staging-wal-archive`
- Separate tenant configs:
  - `malka-staging`
  - `malkavri-staging`
  - `maple-staging`
- Stripe test mode with `BILLING_STRIPE_MODE=test`
  - Requires the Stripe SDK to be available in the VRS server package before
    live test-key invoice calls are exercised; keep `mock` if staging is only
    rehearsing non-Stripe billing flows.
- Twilio test/sandbox credentials, or blank Twilio credentials when phone/SMS is outside the smoke
- Staging-only JWT signing keys
- Seeded Malka and Maple demo accounts

## Suggested Staging Domains

| Surface | Domain |
| --- | --- |
| Malka VRS staging | `staging-vrs.malkacomm.com` |
| Malka VRI staging | `staging-vri.malkacomm.com` |
| Malka admin staging | `staging-admin.malkacomm.com` |
| Malka interpreter staging | `staging-terp.malkacomm.com` |
| Maple VRI staging | `staging-vri.maplecomm.ca` |

DNS and TLS can change, but the domains must remain distinct from production.

## Bring-Up

On the staging host:

```sh
cp .env.staging.example .env.staging
```

Fill all empty secrets. Use staging-only values.

Start the stack:

```sh
export STAGING_ENV_FILE=.env.staging
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  up --build -d
```

Run migrations and seed accounts from the staging checkout. The staging compose
overlay publishes Postgres on `127.0.0.1:55432` and PgBouncer on
`127.0.0.1:56432` for host-side scripts only.

```sh
set -a
. ./.env.staging
set +a

npm run migrate:vrs
npm run migrate:ops
npm run seed:tenant-demo
npm run seed:maple-vri-demo
```

## Smoke

Backend smoke:

```sh
VRS_QUEUE_BASE_URL=https://staging-vrs.malkacomm.com \
VRS_OPS_BASE_URL=https://staging-admin.malkacomm.com/ops \
VRS_TWILIO_BASE_URL=https://staging-vrs.malkacomm.com/twilio \
npm run validate:vrs-stack
```

Maple smoke:

```sh
VRS_QUEUE_BASE_URL=https://staging-vri.maplecomm.ca \
VRS_OPS_BASE_URL=https://staging-vri.maplecomm.ca/ops \
VRS_TWILIO_BASE_URL=https://staging-vri.maplecomm.ca/twilio \
npm run validate:vrs-stack
```

Human smoke must include:

- Client login.
- Interpreter login.
- Request interpreter.
- Interpreter accept.
- Admin live queue/activity view.
- End call.
- CDR check.
- Billing usage check.

## Reset Policy

Staging may be reset. Production may not.

Allowed reset:

```sh
docker compose --env-file .env.staging \
  -f docker-compose.prod.yml \
  -f docker-compose.staging.yml \
  down

docker volume rm malka-vrs-staging_pg-staging-data malka-vrs-staging_pg-staging-wal-archive
```

Never point staging at production database volumes, production Stripe live mode,
or production Twilio numbers.
