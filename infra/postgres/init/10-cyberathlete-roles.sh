#!/bin/sh
# Runs once, when the postgres container initialises an empty data directory. It applies the same
# idempotent script that staging and production run by hand (ADR-011).
set -eu

psql --no-psqlrc -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    -v dbname="$POSTGRES_DB" \
    -v migrator_password="$CYBERATHLETE_MIGRATOR_PASSWORD" \
    -v app_password="$CYBERATHLETE_APP_PASSWORD" \
    -f /infra/postgres/roles.sql
