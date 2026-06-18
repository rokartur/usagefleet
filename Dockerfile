# syntax=docker/dockerfile:1

# ---- deps: install all deps (incl dev) for the build ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: build Next (standalone) + bundle the migrator to plain JS ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* are inlined at build time:
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# Build-time placeholders only — real values are injected at runtime by compose.
# Server-side process.env is read at runtime (Next does not inline it), so these
# are never baked into the output; they just keep module init from throwing.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime-xxxxx
RUN npm run build
# Bundle migrate.ts (+ drizzle migrator + postgres) into one self-contained CJS
# file so the runtime needs neither drizzle-kit nor tsx.
RUN ./node_modules/.bin/esbuild src/scripts/migrate.ts \
      --bundle --platform=node --format=cjs --outfile=migrate.cjs

# ---- runner: minimal standalone image, non-root ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next standalone server + assets (standalone does NOT copy these automatically)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migration assets (SQL + bundled migrator)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/migrate.cjs ./migrate.cjs
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
