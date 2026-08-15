# Contributing

## Setup

```bash
docker run -d --name usagefleet-db -e POSTGRES_DB=app -e POSTGRES_USER=app \
  -e POSTGRES_PASSWORD=app -p 5432:5432 postgres:17-alpine
cp .env.example .env   # one .env at the repo root serves compose and dev
bun install
bun run db:migrate
bun run dev            # http://localhost:3000
```

Two workspaces, one lockfile: `apps/web` (TanStack Start + better-auth +
Drizzle + Postgres) and `apps/cli` (`@usagefleet/cli`, zero runtime deps,
Node ≥ 20). Bun is the package manager; do not add a `package-lock.json`.

## Before you open a PR

```bash
bun run format   # oxfmt: tabs, single quotes, no semicolons, 120 cols
bun run lint     # oxlint
bun run test     # usage math + collector unit tests
```

Commits are Conventional Commits: `type(scope): imperative subject`, where type
is one of feat, fix, refactor, perf, test, docs, chore, build, ci. One commit =
one logical change.

## What to know before changing things

- [`docs/architecture.md`](docs/architecture.md) — request flow, data model,
  auth, entitlement. Read before touching routes, schema, billing or ingest.
- [`docs/usage-math.md`](docs/usage-math.md) — fold, 5h blocks, weekly window,
  the group split, pricing. Read before changing any number on the dashboard.
- [`docs/collector.md`](docs/collector.md) — CLI internals.
- [`AGENTS.md`](AGENTS.md) — the invariants, in short form. They are the part
  that silently produces wrong numbers when broken.

Usage math lives in `apps/web/src/lib/usage/` as pure functions with vitest
cover; routes and components read it, never reimplement it. New math needs a
test. `apps/web/src/components/ui/**` is vendored shadcn — kept re-installable,
so don't hand-edit it.

Schema change: edit `apps/web/src/db/schema.ts`, run `bun run db:generate`,
commit the generated SQL under `apps/web/drizzle/`. Migrations run at container
boot, so a bad one takes the app down with it.

## Blast radius

Every push to `main` publishes `@usagefleet/cli` to npm, and installed
collectors pull it within six hours — CLI changes reach user machines without a
review gate. Treat `apps/cli` accordingly: it must keep working against an old
server, and `usagefleet guard` must fail open.

## License

By contributing you agree that your work ships under the GPL-3.0-or-later terms
in [`LICENSE`](LICENSE).
