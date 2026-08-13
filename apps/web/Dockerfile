# syntax=docker/dockerfile:1
#
# Build context is the MONOREPO ROOT, not this directory — the workspace
# install needs the root package.json and bun.lock:
#   docker build -f apps/web/Dockerfile .
# (docker-compose.yml already does this.)

# ---- deps: workspace install (incl dev) for the build ----
FROM oven/bun:1-alpine AS deps
WORKDIR /repo
# Manifests only, so a source-only change reuses this layer.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/collector/package.json apps/collector/
RUN bun install --frozen-lockfile

# ---- builder: vite build (nitro output) + bundle the migrator to plain JS ----
FROM oven/bun:1-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# No build-time env needed: vite only bundles the server modules, it never runs
# them, so the DATABASE_URL / Stripe guards don't fire during the build.
WORKDIR /repo/apps/web
RUN bun run build
# Bundle migrate.ts (+ drizzle migrator + postgres) into one self-contained CJS
# file so the runtime needs neither drizzle-kit nor bun.
RUN /repo/node_modules/.bin/esbuild src/scripts/migrate.ts \
      --bundle --platform=node --format=cjs --outfile=migrate.cjs

# ---- runner: nitro output on Node, non-root ----
# `.output` bundles every server dependency, so the runner ships no node_modules
# and bun is only used to install and build.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nodejs

COPY --from=builder --chown=nodejs:nodejs /repo/apps/web/.output ./.output

# Migration assets (SQL + bundled migrator), kept at /app for the entrypoint.
COPY --from=builder --chown=nodejs:nodejs /repo/apps/web/drizzle ./drizzle
COPY --from=builder --chown=nodejs:nodejs /repo/apps/web/migrate.cjs ./migrate.cjs
COPY --chown=nodejs:nodejs apps/web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nodejs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
