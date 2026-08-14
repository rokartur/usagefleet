# UsageFleet

Self-hosted tracker for **Claude usage** across one subscription used on many
**desktop** devices (macOS, Linux, Windows). Group devices and see each group's
share of your **5-hour session** and **weekly** limits.

- **Server** — TanStack Start + better-auth + Drizzle + PostgreSQL,
  shipped as two Docker containers (`web` + `db`).
- **Collector** — a tiny Node CLI that tails the local JSONL logs of Claude Code
  (`~/.claude/projects/**/*.jsonl`), Claude Desktop agent-mode, and the
  [pi](https://github.com/badlogic/pi-mono) coding agent (Anthropic-provider
  records only) and pushes token usage to the server.

> Phones are out of scope: the Claude mobile app keeps no local usage logs.

Per-OS setup walkthrough (macOS / Linux / Windows): **[INSTALL.md](INSTALL.md)**.

## How usage is measured

The headline **5-hour** and **weekly** percentages are Claude's own utilization
figures — not an estimate. The collector auto-detects your local Claude login on
each machine (subscription OAuth from `claude`, or `ANTHROPIC_API_KEY`), reads
the real numbers from Anthropic's `anthropic-ratelimit-unified-5h/7d-utilization`
response headers, and reports them to the server. No keys are pasted into the web
app. (Same idea as
[Claude-Usage-Tracker](https://github.com/hamed-elfayome/Claude-Usage-Tracker).)

Those account-wide percentages are then split **per group** using local activity:
the collector tails Claude Code's JSONL logs, dedups streamed segments by `uuid`,
folds by `(messageId, requestId)`, and each group's share of billable tokens
(input+output+cache-creation, excluding the huge cache-read replay) apportions the
official total.

## Run the server (Docker)

```bash
cp .env.example .env

# Generate the better-auth secret (>=32 chars) and write it into .env:
SECRET=$(openssl rand -base64 32)
sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" .env   # macOS
# Linux: sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" .env

# …then fill in the rest. compose refuses to start until each of these is set,
# so there is no half-configured boot:
#   POSTGRES_PASSWORD
#   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET      (github.com/settings/developers)
#   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET      (console.cloud.google.com/apis/credentials)
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_SOLO, STRIPE_PRICE_FLEET
# BETTER_AUTH_URL defaults to http://localhost:3000 — set it for any other host,
# it is what the OAuth callback URLs must match.

docker compose up --build -d  # db + web; migrations run automatically on boot
# open http://localhost:3000  (override host port with WEB_PORT=)
```

For Docker development with Vite hot reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Changes under the local repository are bind-mounted into `web`; dependencies
and database migrations are refreshed when the container starts.

`BETTER_AUTH_SECRET` signs session cookies — it must be a high-entropy string of
at least 32 characters. Generate one with `openssl rand -base64 32` (or
`node -e "console.log(crypto.randomBytes(32).toString('base64'))"`). Keep it
secret and stable; changing it invalidates all existing sessions.

**Lock signup** — set `ALLOW_SIGNUP=false` to disable new account creation
(enforced server-side by better-auth, not just hidden in the UI). Typical flow:
sign up once, then set `ALLOW_SIGNUP=false` and `docker compose up -d` to apply.

**Upgrading from the email + password release** — sign-in is now GitHub/Google
only. Existing users keep their account by signing in with a provider that
reports the *same* address; migration `0013_link_legacy_logins.sql` marks their
email verified so better-auth will link it, and runs automatically at startup.
A user whose GitHub/Google address differs from the one they signed up with
lands on a new empty account instead — there is no self-service merge, so move
their devices by hand if that comes up.

`web` runs Drizzle migrations at startup (idempotent), then serves the app. The
DB is reached over the compose network at `db:5432`; it is not exposed to the
host by default. The `web` container has a `/api/health` healthcheck.

**Behind a reverse proxy (HTTPS)** — set `TRUST_PROXY` to the number of proxies
in front of the app (or `true` for one) so per-IP rate limiting reads a real
client IP from `X-Forwarded-For`. Leave it `false` for direct exposure: the
header is client-forgeable, so it's ignored and anonymous requests share one
bucket. Your proxy should strip inbound `X-Forwarded-For`.

A deployment that serves the public installer (`curl | sh`) has to set this. The
installer's download route is anonymous on purpose, so on the shared bucket one
person installing spends the limit for everyone else.

> Rate limits (and better-auth's login throttle) are in-memory: they reset on
> container restart and assume a **single** `web` instance. Add a shared store
> before running multiple replicas.

**Port already in use?** If `curl localhost:3000` returns `000` even though
`docker compose ps` shows `web` up and healthy, another process holds host port
3000 (the container app listens fine inside — only the host→container forward
fails). Pick a free port: set `WEB_PORT=3002` and the matching
`BETTER_AUTH_URL` in `.env`, then `docker compose up -d`.
The auth client uses the same origin it's served from, so no rebuild is needed
to change ports.

## Use it

1. Sign in at `/login` with GitHub or Google.
2. **Groups** → create groups (e.g. "Laptops", "Work desktops").
3. **Devices** → add a device, assign a group, **copy the token** (shown once).
4. Install the collector on that machine (see `apps/collector/README.md`) with the
   token, on a machine where you're signed into Claude Code. It auto-detects your
   subscription and reports real usage — the **Dashboard** fills in within a
   minute. No keys to configure in the web app.

## Local development

```bash
docker run -d --name usagefleet-db -e POSTGRES_DB=app -e POSTGRES_USER=app \
  -e POSTGRES_PASSWORD=app -p 5432:5432 postgres:17-alpine
cp .env.example .env   # one .env at the repo root serves compose and dev
bun install            # installs every workspace
bun run db:migrate     # apply migrations
bun run dev            # http://localhost:3000
bun run test           # usage-math + collector unit tests, both workspaces
```

The root scripts fan out with `bun run --filter`; run one workspace directly
with `bun run --filter collector test` (or `cd apps/collector && bun test`).
Root scripts pass the root `.env` down, so `cd apps/web && bun run dev` needs
its own env.

Schema changes: edit `apps/web/src/db/schema.ts`, run `bun run db:generate`
(drizzle-kit), commit the SQL under `apps/web/drizzle/`. better-auth tables live
in `apps/web/src/db/auth-schema.ts` (regenerate with
`bunx @better-auth/cli generate`).

## Layout

Bun workspaces — one lockfile, one `node_modules`, two apps.

| Path | What |
|------|------|
| `apps/web/` | TanStack Start app (`web` workspace) |
| `apps/web/src/db/` | Drizzle schema (auth + subscription + groups/devices/usage_event) |
| `apps/web/src/lib/usage/` | fold + 5h blocks + weekly window + limits + pricing (pure, unit-tested) |
| `apps/web/src/lib/auth.ts` | better-auth (GitHub + Google OAuth, Stripe); device auth is a separate hashed token |
| `apps/web/src/lib/plans.ts` | plan catalog; `billing.ts` turns a subscription into a device cap |
| `apps/web/src/routes/api/v1/usage.ts` | ingestion endpoint (`x-api-key`, dedup on `uuid`) |
| `apps/web/src/routes/_dash/` | dashboard, groups, devices, billing, settings |
| `apps/collector/` | standalone CLI (`usagefleet`), zero runtime deps |
| `apps/web/Dockerfile`, `docker-compose.yml` | two-container deployment (build context = repo root) |
