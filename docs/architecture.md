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
       └─ cli: claude-limits              oauth/usage (sub, free) or 1-token ping (api)
            └─ POST /api/v1/limits        Anthropic's OWN utilization numbers
                 └─ claude_account + limit_sample   keyed by the local login
  dashboard: per account: fold rows → cost share per group → split the official pct
```

Two independent legs. The usage leg is ours (tokens, models, cost estimates);
the limits leg is Anthropic's own truth about how full the account is. The
dashboard's headline numbers come from the limits leg — the usage leg only
decides *whose* usage filled it.

Everything downstream of the limits leg is per Anthropic account: a fleet split
over two Claude subscriptions gets two independent budgets, and each device
counts against whichever one it is signed into.

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
  prefix, `revoked`, `last_seen_at`, `collector_version`, optional `group_id`,
  and `claude_account_id` (stamped from its limits posts, null until the first).
- `claude_account` — one Anthropic subscription the fleet draws on, keyed
  `(user_id, ext_id)` with `ext_id` = the `oauthAccount.accountUuid` the
  collector reads locally. `ext_id IS NULL` is the bucket for devices whose
  login can't be identified (API-key setups, collectors older than
  multi-account); `NULLS NOT DISTINCT` keeps it to one per user. Holds the
  latest reported utilization (`five_hour_pct`, `seven_day_pct`, resets,
  `model_limits` jsonb) — Anthropic meters each subscription separately, so this
  is per account and not per user.
- `usage_event` — one raw JSONL segment. Unique on `(user_id, uuid)`; indexed on
  `(user_id, ts)` and `(device_id, ts)`. Never aggregate without folding.
- `user_settings` — plan preset, token limits, week reset weekday/hour, cache TTL,
  admin free-device grant. Its `*_pct` / `model_limits` columns are dead as of
  migration 0017, which moved them to `claude_account`.
- `limit_sample` — peak utilization per `(claude_account, window, window_start)`.
  Claude only reports the *open* window, so this is the only record of how full a
  closed one got; the past-windows card reads it instead of guessing.

## Ingest API contract

All three endpoints: `x-api-key` or `Authorization: Bearer <device token>` →
`authenticateDevice()` (hash lookup, revoked check) → plan re-check. The two
POSTs then read an arktype-validated body through `readJsonCapped`; the GET has
no body. A device outside the plan gets `402` from all three, which the guard
treats as open like any other non-OK. `last_seen_at` is touched by the two POST
handlers, and on the `402` path so a parked device still shows as alive.

- `POST /api/v1/usage` — `{ records: [...] }`, ≤1000 per batch. Responds with
  accepted/duplicate/skipped counts. At-least-once by design: the collector only
  commits a file offset after the server acknowledges, and the unique index
  absorbs the replay. Records older than `devices.created_at` are dropped
  (`skipped`): a fresh collector tails the machine's whole log history, and usage
  from before the token existed is not this device's to report. Records dated in
  the future are *clamped* to arrival time, not dropped — a machine with a fast
  clock would otherwise inflate month and all-time spend permanently, and
  rejecting them instead would be silent data loss, since the collector commits
  its file offsets on any 200 and never reads `skipped`. Clamped rows are counted
  back as `clamped`, because nothing else in the response would reveal a machine
  whose clock is wrong. Each token field must be an integer 0..500,000,000 — the
  columns are int4, and a record outside that is a `422` the collector bisects
  down to and drops, so it is the one wire bound a third-party client has to know.
  `os` is also accepted as `other` (freebsd/sunos/…); the column is a
  display-only enum, so an unlabelled box keeps whatever it had rather than
  forcing a migration.
- `POST /api/v1/limits` — the parsed rate-limit headers, plus the optional
  `account` the collector read from `~/.claude.json`. Upserts `claude_account`,
  stamps the device with it, and upserts the peak into `limit_sample`.
- `GET /api/v1/limits` — what `usagefleet guard` asks before a prompt. Returns
  `{ group, sessionPct, weeklyPct, blocked, blockedWindow, blockedUntil,
  reportedAt }`; the guard reads `blocked` to decide and `blockedWindow` /
  `blockedUntil` to word the refusal. `blocked` is true only when the device's
  group has the matching switch on, that window is at 100% of the group's budget
  slice, and the last reported utilization is younger than `LIMITS_STALE_MS`
  (15 min). A stale reading never blocks: the limits leg can die while upload
  keeps working, and nothing decays the stored percentage.

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
`package.json`; env in `.env.example`.
