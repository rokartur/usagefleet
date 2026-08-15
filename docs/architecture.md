# Architecture

How a token counted on a laptop becomes a percentage on the dashboard, and which
file owns each hop.

## End-to-end flow

```
Claude Code / Desktop / Pi
  └─ ~/.claude/projects/**/*.jsonl        one line per streamed segment
       └─ cli: scanner → tailer → parser  read from stored byte offset
            └─ POST /api/v1/usage         bearer device token, ≤1000 records
                 └─ usage_event rows      deduped on (userId, uuid)
       └─ cli: claude-limits              1-token ping to api.anthropic.com
            └─ POST /api/v1/limits        Anthropic's OWN utilization headers
                 └─ user_settings + limit_sample
  dashboard: fold rows → cost share per group → split the official pct
```

Two independent legs. The usage leg is ours (tokens, models, cost estimates);
the limits leg is Anthropic's own truth about how full the account is. The
dashboard's headline numbers come from the limits leg — the usage leg only
decides *whose* usage filled it.

## Web app (`apps/web`)

TanStack Start (SSR + server functions), React 19, Tailwind v4, shadcn, Drizzle
+ Postgres, better-auth (email/password, Google, GitHub) with its Stripe plugin.

Routing is file-based under `src/routes`:

- `_dash.tsx` — authenticated layout; `beforeLoad` redirects to `/login`, so no
  child route repeats the auth check.
- `_dash/{dashboard,devices,groups,settings,billing,admin}.tsx` — the app.
  `admin.tsx` re-checks `requireAdmin()` server-side.
- `api/v1/{usage,limits}.ts` — the collector's ingest API (device-token auth).
- `api/dashboard.ts` — the browser's live poll; returns `toDashboardDTO(...)`.
- `api/auth/$.ts` — better-auth handler. `index.tsx`, `login.tsx`,
  `reset-password.tsx`, `robots[.]txt.ts`, `sitemap[.]xml.ts` — public surface.

Data access is layered so pages stay thin:

| Layer | File | Job |
| --- | --- | --- |
| session | `lib/session.ts` | `requireUser()` / `requireAdmin()` (env `ADMIN_EMAILS`) |
| reads | `lib/data.ts` | every dashboard/history query + the group split |
| writes | `lib/actions.ts` | `createServerFn` mutations (groups, devices, settings) |
| math | `lib/usage/*` | pure, unit-tested — see [`usage-math.md`](usage-math.md) |
| money | `lib/billing.ts`, `lib/plans.ts`, `lib/stripe-prices.ts` | entitlement |
| guards | `lib/rate-limit.ts`, `lib/device-auth.ts`, `lib/device-token.ts` | trust boundary |

`lib/promise-cache.ts` collapses concurrent identical loads (in-process only).
`lib/flags.ts` gates optional features by env presence (Stripe, OAuth).

## Data model (`src/db/schema.ts`)

- `user` / `session` / `account` / `verification` / `subscription` — better-auth
  generated (`db/auth-schema.ts`), regenerate rather than hand-edit.
- `groups` — a named bucket of devices, owned by a user, with the two
  `block_on_*_limit` toggles the prompt guard enforces.
- `devices` — one collector install. `token_hash` (SHA-256, unique) + a display
  prefix, `revoked`, `last_seen_at`, `collector_version`, optional `group_id`.
- `usage_event` — one raw JSONL segment. Unique on `(user_id, uuid)`; indexed on
  `(user_id, ts)` and `(device_id, ts)`. Never aggregate without folding.
- `user_settings` — plan preset, token limits, week reset weekday/hour, cache TTL,
  admin free-device grant, and the latest collector-reported utilization
  (`five_hour_pct`, `seven_day_pct`, resets, `model_limits` jsonb).
- `limit_sample` — peak utilization per `(user, window, window_start)`. Claude
  only reports the *open* window, so this is the only record of how full a closed
  one got; the past-windows card reads it instead of guessing.

## Ingest API contract

Both endpoints: `Authorization: Bearer <device token>` →
`authenticateDevice()` (hash lookup, revoked check, `last_seen_at` touch) →
plan re-check → arktype-validated body read through `readJsonCapped`.

- `POST /api/v1/usage` — `{ records: [...] }`, ≤1000 per batch. Responds with
  accepted/duplicate counts. At-least-once by design: the collector only commits
  a file offset after the server acknowledges, and the unique index absorbs the
  replay.
- `POST /api/v1/limits` — the parsed rate-limit headers. Writes `user_settings`
  and upserts the peak into `limit_sample`.
- `GET /api/v1/limits` — what `usagefleet guard` asks before a prompt:
  `{ blocked, reason? }` based on the device's group toggles and its budget slice.

Status codes carry meaning to the CLI: `401` revoked/unknown token (stop),
`402` device outside the plan's device limit (park, keep data), `400/422`
malformed records (the collector splits the chunk and retries), `429` backoff.

## Auth and entitlement

Sessions are better-auth cookies. Device tokens are a separate, long-lived
credential — issued once in `/devices`, shown once, stored hashed.

`accountPlan(userId)` in `lib/billing.ts` is the single source of device caps:
the newest subscription row in `ENTITLING_STATUSES` (`active`, `trialing`,
`past_due` — a failed charge shouldn't yank a fleet mid-dunning), else free.
`planDevices()` maps plan + Stripe seat quantity to a number; only `custom`
varies with seats. Prices live in Stripe, never in the catalog.

## Local development

`docker compose -f docker-compose.dev.yml up` for Postgres, then `bun run dev`.
Schema changes are always a committed migration: `bun run db:generate`, then
`bun run db:migrate` locally (the container runs it at boot). Commands live in
`package.json`; env in `.env.example`; deployment in [`README.md`](../README.md).
