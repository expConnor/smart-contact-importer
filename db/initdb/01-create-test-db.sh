#!/bin/bash
# Creates the disposable test database beside the dev one, so `npm run test:e2e`
# can TRUNCATE freely without touching the seed a reviewer is clicking through.
#
# The postgres image runs this ONCE, on first init of an empty data directory,
# so an existing `pgdata` volume will NOT re-run it. That is fine and needs no
# action: `prisma migrate deploy` creates a missing database itself, so the
# first `npm run test:e2e` on an old volume just works.
#
# Do NOT reach for `docker compose down -v` to get this script to run — it
# destroys the dev seed for no gain. What this script buys on a FRESH volume is
# ownership set explicitly and the database existing before anything asks.
set -euo pipefail

# CREATE DATABASE cannot run inside a transaction block, so no `-1` here.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE DATABASE "${POSTGRES_DB}_test" OWNER "$POSTGRES_USER";
EOSQL

echo "initdb: created ${POSTGRES_DB}_test"
