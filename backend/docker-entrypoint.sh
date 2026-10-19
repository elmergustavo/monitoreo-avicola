#!/bin/sh
set -e

echo "Applying pending database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Starting API..."
exec node dist/main.js
