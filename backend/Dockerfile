# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:24-alpine AS build
WORKDIR /app

# Install dependencies first to leverage the layer cache.
# The schema is needed because `postinstall` runs `prisma generate`.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev --ignore-scripts

# ---------- Runtime stage ----------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

# OpenSSL is required by the Prisma schema engine (migrate deploy).
RUN apk add --no-cache openssl

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
