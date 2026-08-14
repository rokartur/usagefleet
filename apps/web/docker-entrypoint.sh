#!/bin/sh
# Run DB migrations (idempotent — tracked in __drizzle_migrations) then start
# the server. `exec` makes Bun PID 1 so it receives SIGTERM for graceful shutdown.
set -e

echo "Running database migrations…"
bun migrate.cjs

echo "Migrations complete. Starting server…"
exec "$@"
