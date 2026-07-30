#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'SQL'
SELECT 'CREATE DATABASE docmost_integrations OWNER docmost'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'docmost_integrations'
)\gexec
SQL
