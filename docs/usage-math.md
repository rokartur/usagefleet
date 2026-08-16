# Usage math

Everything numeric on the dashboard comes from `apps/web/src/lib/usage/` (pure,
vitest-covered) plus the split in `lib/data.ts`. Read this before changing a
number; the failure mode is silent and plausible-looking.

## Fold before you sum

Claude Code writes one JSONL line per streamed content segment, all sharing one
`message.id`, each carrying a *growing* usage object. Summing raw rows
double-counts by a large factor.

`foldEvents()` keys by `(messageId, requestId)` — falling back to the row's own
`uuid` — and keeps the row with the **largest** total, i.e. the terminal segment.
`sumTokens()` is for already-folded input only.

SQL aggregates do the same fold in-database (`loadRecentEvents`,
`loadDailyAggregates`, `loadWindowAggregates`, `getProjectUsage`):
`DISTINCT ON (fold key) ... ORDER BY total DESC`. If you write a new query over
`usage_event`, copy that shape.

## Token vocabulary

- **total** = input + output + cache_creation + cache_read.
- **billable** (`billableTokens`) excludes cache_read — replayed context, ~97% of
  raw totals. Display metric only.
- **cost** (`pricing.ts`) is what the group split actually weighs: public API list
  prices per model, output 5×, cache write 1.25× (5m) or 2× (1h), cache read
  0.1×. Prices refresh from LiteLLM's map once a day per process, falling back to
  hardcoded tiers offline. Cache writes are priced by the per-TTL breakdown the
  log carried (`cache_creation_5m/1h_tokens`, reported by the collector) where
  present; only the untagged remainder (legacy rows, pi rows) falls back to
  `cacheWriteTtl` in `user_settings` — Claude Code writes 5m caches unless
  `ENABLE_PROMPT_CACHING_1H=1`.

Cost is an estimate for a subscription account. It exists because Anthropic's
limits are cost-shaped, not token-shaped, so it is the least wrong weight for
apportioning a percentage.

## Windows

- **5h window**: Anthropic's, not ours. The collector reports the open window's
  utilization together with its `resets_at`, and the dashboard anchors on that
  instant. There is no local block-boundary reconstruction from event
  timestamps — an earlier ccusage-style implementation was deleted once the
  collector began reporting the real numbers.
- **Weekly window** (`window.ts`): most recent `weekday`@`hourUtc` at or before
  now, from `user_settings` (default Monday 00:00 UTC).
- **Past windows** (`windowSpans`): the recorded utilization samples ARE the
  boundaries — each sample's `window_start` is a real reset instant minus the
  window length. Anthropic's windows are not on a fixed grid (after idle the
  next one starts at the first prompt), so only time no sample covers is filled
  with `pastWindowStarts` grid guesses strided from the *current* `resets_at`,
  clipped where they overlap a real window. The window containing `now` is
  excluded.

## The percentages

The headline 5h and weekly numbers are Anthropic's own utilization, read by the
collector (oauth/usage for subscriptions, rate-limit headers for API keys) and
stored on `claude_account` — one row per Anthropic subscription, since
Anthropic meters each one separately. Stored with one decimal (`real` columns):
the budget scale multiplies by the group count, so integer storage would
amplify quantization. Display rounds once, at the end. Until a collector
reports once, that account shows `connected: false`.

Everything below happens per account. A device counts against the account it is
signed into (`devices.claude_account_id`, stamped from its limits posts), the
same way its usage already follows it between groups. Devices that never report
a login fold into the unidentified bucket, or into the only account there is.

`splitByShare()` (`lib/data.ts`) apportions one official percentage across groups:

1. filter folded events to the window,
2. bucket by key, sum each bucket's estimated cost,
3. `exactPct = officialPct × (bucketCost / totalCost)` — kept unrounded.

`groupBudgetPct()` then scales a share into what the UI shows:
`round(exactPct × groupCount)`, where `groupCount` counts the groups holding a
live (non-revoked) device on *this* account — a group that never touches a
subscription cannot eat its budget, and a group whose only device was revoked
stops claiming a slice (its historical events still weigh in the split). Every such group is budgeted an equal slice of the account, so
**with two groups, a group sitting at half the account reads 100%**.
Deliberately uncapped: past 100% that group is eating another's slice, which is
the thing worth seeing. Rounding happens once, at the end — rounding the share
first would multiply the error by the group count.

Per-model limits (e.g. the Fable weekly cap) get the same treatment, with the
window length parsed from the header key (`5h`, `7d`, …).

## Past windows card

Claude reports only the currently open window, so `recordLimitSample()` upserts
the running peak per `(claude_account, window, window_start)` on every limits post.
`getWindowHistory()` turns those samples into real window boundaries
(`windowSpans`, see above), aggregates tokens between them in SQL, and splits
each closed window across groups — real recorded utilization on real
boundaries, not a reconstruction from token counts. Windows nobody sampled
show tokens only, on grid-guessed (possibly clipped) spans.

These percentages are **account shares, not budget slices**: the card's group
rows carry `accountPct`, so a group at half the account reads 50% here while the
live dashboard shows the same group at 100% of its slice. The budget-slice rule
above applies to the live cards only. Two tables on one page, two meanings, on
purpose: a closed window is a record of what happened, not a live budget to
spend against.

## Usage explorer

The explorer (`UsageExplorer.tsx`) is a client-side pivot over the same all-time
`HistoryRow[]` the history route already loads: pick a period, a metric (cost,
billable, total, input, output, cache read) and a dimension (group, model,
device, source), and it buckets by day or by month once the span passes
`MAX_DAILY_COLUMNS`. It adds no math of its own — token metrics come from
`billableTokens`/`recordTotal` in `lib/usage/fold.ts`, cost is the per-cell
`costUsd` the server already priced. Nothing here is limit-shaped either.

## Projects table

`getProjectUsage()` groups the same in-SQL fold by `(cwd × model)` over a fixed
30-day window, then sums the models away per directory so each project carries
one cost. The working directory is the only project identity the JSONL logs
carry, so two checkouts of the same repo are two projects, and a message logged
without a `cwd` lands in one "Unknown" row. Claude Code and Desktop put it on
every assistant line; pi puts it only on its session header, which the tailer
reads per file (`piSessionCwd`) — rows ingested before that landed in "Unknown"
and stay there, since ingest dedups on uuid. Nothing here is limit-shaped: the
table is tokens and estimated cost, per user, across every account.

## When you change any of this

`usage.test.ts` and `daily-agg.test.ts` pin the fold and the aggregate sums;
`data.test.ts` pins the past-window construction, `groupBudgetPct` and
`splitByShare` — i.e. the budget-slice rule above and the cost-weighted split
that feeds it, including the window bounds, the fold and the zero-cost case. Run
`bun run test` in `apps/web`. Keep new math in `lib/usage/` as a pure function
with a test; routes and components consume it.
