# UsageFleet — agent guide

Hosted tracker for one Claude subscription used on many desktops. A CLI
collector tails local Claude JSONL logs and reports both raw token usage and
Anthropic's own rate-limit utilization; the web app splits those official
percentages across device groups.

Two workspaces, one lockfile: `apps/web` (TanStack Start + better-auth + Drizzle
+ Postgres) and `apps/cli` (`@usagefleet/cli`, zero runtime deps, Node ≥ 20).

## Read next

- [`docs/architecture.md`](docs/architecture.md) — request flow, data model, auth,
  entitlement, where each subsystem lives. Read before touching routes, schema,
  billing or the ingest API.
- [`docs/usage-math.md`](docs/usage-math.md) — fold, windows, the cost-weighted
  group split, pricing. Read before touching anything that produces a number on
  the dashboard.
- [`docs/collector.md`](docs/collector.md) — CLI internals: watch loop, tailer
  offsets, limits reporting, prompt guard, per-OS autostart, self-update.
- [`README.md`](README.md) — product overview and local development.
  `.env.example` is the authoritative env list.
- [`apps/cli/README.md`](apps/cli/README.md) — the CLI's user-facing manual.

## Invariants

Break one of these and the product silently reports wrong numbers or leaks access.

- **Never SUM raw `usage_event` rows.** Claude Code writes one row per streamed
  segment. Fold by `(messageId, requestId)` keeping the largest total first —
  `lib/usage/fold.ts`, mirrored in SQL by `FOLD_KEY`/`ROW_TOTAL` in `lib/data.ts`,
  which every hot query folds through. A new query over `usage_event` copies that
  shape rather than inventing a tie-break. Ingest dedups on `(userId, uuid)`,
  scoped per user so no account can poison another's rows.
- **The headline 5h/weekly percentages are Anthropic's, not ours.** The collector
  reads them from Anthropic's oauth/usage endpoint (response headers on API
  keys); the server only *splits* them per group. The split is **delta
  attribution**: `limit_change_point` records every reading whose pct rose
  (identified accounts only; readings under a minute apart merge at read time),
  and each rise goes to the groups whose events fall in that interval, weighted
  by cost inside it. Per-model limits get their own series, keyed by model id.
  Cost share over the whole window is the fallback when an account has no points,
  and stays the method for the past-windows card. Token counts are display-only.
- **List prices are a fallback, not the model.** Where an account has enough
  history, `lib/usage/calibration.ts` fits what Anthropic's meter actually
  charges per token bucket (cache reads move it ~16× less than their price
  implies) and stores it on `claude_account.calibration`. A fit is only kept
  when it beats list prices on the held-out slice it was not fitted to — that
  gate is the invariant. Never ship weights without it: a fleet whose rises come
  from machines outside it will happily fit noise. The gate only means something
  if the fit reads the series the split reads, so both go through `mergePoints()`
  and both apply `lagMs`; every consumer of a split (live cards *and* the
  past-windows card) uses the same weights, or one window reads two ways.
- **Everything limit-shaped is per Anthropic account, not per user.** Anthropic
  meters each subscription separately, so percentages live on `claude_account`
  (keyed by the `accountUuid` the collector reads from `~/.claude.json`) and a
  device counts against the account it is signed into. One user can hold several.
- **A group's percentage is its budget slice**, i.e. share × the number of groups
  with a live (non-revoked) device on that account: with two such groups, one at
  half the account reads 100%. Uncapped past 100% on purpose.
- **The collector reports to one server and cannot be redirected.** `ENDPOINT` in
  `apps/cli/src/config.ts` is a constant; there is no flag, env var or stored
  field. `login` exits non-zero on `--endpoint` rather than ignoring it, because
  a silent fallback would ship a self-hoster's usage to the hosted service.
- **Device tokens are stored as SHA-256 only** (`lib/device-token.ts`), shown once
  at creation. Every collector endpoint re-checks the plan
  (`deviceWithinPlan` → 402) because a downgrade parks devices without revoking.
- **`usagefleet guard` fails open.** Offline, timeout, junk JSON, old server →
  exit 0. Only an explicit `blocked: true` refuses a prompt.
- **Admin is env-only** (`ADMIN_EMAILS`), never a column, so no session can grant
  itself the panel. `/admin` re-checks server-side.
- **Rate limits and the promise cache are in-process**: single `web` instance
  assumed. Add a shared store before running replicas.
- **Trust boundaries validate with arktype and a capped body** —
  `readJsonCapped(req, max, Schema)`. Every free-form string needs an explicit
  ceiling; it lands in Postgres verbatim.

## Conventions

- Usage math lives in `apps/web/src/lib/usage/` as pure functions with vitest
  cover. Routes and components read it, never reimplement it.
- Data loading: `createServerFn` in the route file (dashboard-style) or
  `lib/actions.ts` for mutations; both go through `requireUser()`/`requireAdmin()`.
  Query bodies live in `lib/data.ts`.
- `apps/web/src/components/ui/**` is vendored shadcn, kept re-installable — don't
  hand-edit it, and don't chase lint rules there (already relaxed in
  `oxlint.config.ts`).
- Style is enforced, not debated: tabs, single quotes, no semicolons, 120 cols,
  layered import groups. Run `bun run format` and `bun run lint`.
- Schema change: edit `apps/web/src/db/schema.ts` → `bun run db:generate` → commit
  the SQL under `apps/web/drizzle/`. `web` applies migrations at boot; keep them
  idempotent-safe. better-auth tables are generated into `db/auth-schema.ts`.
- The codebase comments *why*, not *what*. Keep that when you edit — a comment
  that no longer matches its code is worse than none.

## Blast radius

- **Every push to `main` publishes `@usagefleet/cli` to npm** (`.github/workflows/release.yml`,
  version = manifest major.minor + run number) and installed collectors pull it
  within six hours. CLI changes ship to user machines without a review gate.
- `docker compose down -v` drops the `pgdata` volume, i.e. all usage history.
- Migrations run automatically on container start; a bad one takes the app down
  with it.
