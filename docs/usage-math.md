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
- **Weekly window**: Anthropic's too — anchored on the reported `resets_at`
  minus 7 days, clamped to at most 7 days ending now so a stale reset can't
  widen the split window. A reset more than one whole window ahead is discarded
  as not this window's: `resets_at` is device-reported and range-checked nowhere
  on the way in, and taken literally it would open the window in the future,
  leaving it empty so the account's whole percentage would read as unattributed
  (`windowStartOf`). The `user_settings` weekday/hour survive only as the
  past-windows grid fallback (`weekWindowStart` in `window.ts`) for an account
  that has never reported a weekly reset.
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

`splitByShare()` (`lib/data.ts`) apportions one official percentage across
groups by **delta attribution**: every limits post that moved a window's pct
appends a timestamped change point (`limit_change_point`, written by
`recordLimitChangePoint`, pruned past the longest window), and each *rise*
between consecutive readings is split by the estimated cost of the folded
events inside that interval (`riseWeights`). A percentage point is charged to
whoever was active when it was burned, not smeared over the whole window — the
group that worked all night keeps its 30% even when another group out-spends it
in the morning. Details that matter:

- The window opens at 0% by definition; a synthetic final reading at
  (`now`, official pct) carries any rise not yet recorded. With no change
  points at all this collapses to one interval = the classic whole-window cost
  split, so the fallback is the algorithm's own degenerate case.
- Only **rises** are recorded. Anthropic's utilization does not fall inside a
  window, so a fall means two devices on one account read the endpoint moments
  apart and their posts landed out of order (`at` is receipt time). Storing that
  dip would make the recovery back to the true value read as an extra rise,
  inflating the denominator and diluting every real group. A reset needs no row:
  the write compares only against the current window's points, and `riseWeights`
  anchors each window at 0.
- Event timestamps come off the device's clock, change points off ours. Ingest
  measures the difference from the `sentAt` the collector stamps at upload and
  shifts the batch onto server time (`lib/usage/clock.ts`), so a drifting
  machine's rows land in the interval that actually caused the rise instead of
  handing it to a neighbour. A single reading is drift *plus* transport, and the
  collector stamps `sentAt` once per batch and reuses it across retries, so a
  retried upload looks minutes behind. Both inflations are one-directional and
  transient while a clock offset is persistent, so the device keeps the
  **minimum** over an hour-long window (`devices.clock_offset_ms`), the same
  reason NTP filters on minimum delay. Inside a window the held value can only
  fall, so the window is re-armed once it ages out; that bound is what limits how
  long a clock that moved the other way (an NTP step after a resume) keeps being
  corrected by a stale offset. Unmeasurable
  drift (collector too old to send `sentAt`, offset too large to be a clock)
  holds the last known value and the future-clamp stays as the guard.
- Every rise is stored; readings closer than **one minute** merge into one
  interval at read time. A minute is the collector's poll period, so two
  readings inside it are one moment seen by two machines. This used to be five
  minutes, on both sides, to absorb the unmeasured delay between an event's
  timestamp and the moment its tokens reach Anthropic's meter. Measured since
  (cross-correlating per-minute cost against rises on real accounts) that delay
  peaks at about a minute, most of which is the poll period itself — while the
  five-minute bound was dropping ~25% of all rises and moving group shares by up
  to 6 points. Worse, it merged idle intervals into active ones, hiding
  off-fleet usage that should have read as `UNATTRIBUTED`. What remains of the
  delay is fitted per account (see *Calibration*) instead of guessed at.
  The merge interval is the attribution resolution: inside one, we are back to
  splitting by cost.
- A rise over an interval with no priceable events goes to the sentinel
  `UNATTRIBUTED` key — usage from before the collector ran or from a device
  outside the fleet — and shows as an "Unattributed" row instead of being
  silently redistributed to the groups. Slivers under half a point are dropped
  as timing noise, from the denominator too, so the real groups still sum to the
  official pct. That row is **not a group**: it holds no budget slice, so it is
  displayed as a plain account share and never goes through `groupBudgetPct()`.
- Only identified accounts get change points. The `ext_id = NULL` bucket can
  hold several logins at once, whose interleaved readings would look like one
  account sawtoothing and invent rises; those accounts keep the cost split,
  which reads no series shape.
- Weights are normalized to the official pct, which stays authoritative even
  after a downward correction; concurrent activity inside one interval still
  splits by cost, which is as far as Anthropic's aggregate number can be taken.

### Calibration

The cost that weighs an interval is API list prices, which are only a proxy for
Anthropic's limit meter — and a measurably biased one. An account with enough
recorded history fits its own weights instead (`lib/usage/calibration.ts`,
stored on `claude_account.calibration`, refit at most daily off the back of a
limits post — there is no scheduler, and reports arrive every minute anyway).

Each interval between two change points is a labelled example: Anthropic's own
rise, against the list-price cost of what the fleet did in between, split into
four buckets (input, output, cache write, cache read). Non-negative least
squares fits one multiplier per bucket, plus a meter lag chosen from the same
candidates. On the account this was developed against, that halves held-out
error versus list prices (35% → 18% MAPE), almost entirely by discovering that
**cache reads barely move the limit at all** — the price list charges them 1/50
of an output token, the meter closer to 1/800.

What keeps this honest:

- Weights are fitted on the older 70% of the history and scored on the newer
  30%. A fit that does not beat list prices on data it never saw is discarded
  and the account keeps the list-price split. Fleets whose rises are driven by
  machines outside them never produce a calibration, which is the correct
  outcome: their rises genuinely are not explained by their events.
- No bucket may stray more than 20× from the scalar the baseline fits. A bucket
  the account barely uses carries no signal, and least squares will hand it an
  enormous weight that costs nothing on the fitted data and misattributes wildly
  the first time it is used in earnest.
- Intervals no event falls in are excluded from the fit. Asking the weights to
  explain a rise from nothing is how a fit learns garbage; that rise is
  `UNATTRIBUTED` at read time and stays that way.
- Only ratios between buckets reach the split, since weights are normalized to
  the official pct like any other cost. The absolute scale (pct per dollar) is
  fitted too, and is what a forecast would need, but nothing reads it yet.

`groupBudgetPct()` then scales a share into what the UI shows:
`round(exactPct × groupCount)`, where `groupCount` counts the groups holding a
live (non-revoked) device on *this* account — a group that never touches a
subscription cannot eat its budget, and a group whose only device was revoked
stops claiming a slice (its historical events still weigh in the split). Every
such group is budgeted an equal slice of the account, so **with two groups, a
group sitting at half the account reads 100%**.
Deliberately uncapped: past 100% that group is eating another's slice, which is
the thing worth seeing. Rounding happens once, at the end — rounding the share
first would multiply the error by the group count.

Per-model limits (e.g. the Fable weekly cap) get the plain whole-window cost
split — no change points are recorded for them — with the window length parsed
from the header key (`5h`, `7d`, …).

## Past windows card

Claude reports only the currently open window, so `recordLimitSample()` upserts
the running peak per `(claude_account, window, window_start)` on every limits post.
`getWindowHistory()` turns those samples into real window boundaries
(`windowSpans`, see above), aggregates tokens between them in SQL, and splits
each closed window across groups — real recorded utilization on real
boundaries, not a reconstruction from token counts. Windows nobody sampled
show tokens only, on grid-guessed (possibly clipped) spans.

This card also splits by **whole-window cost**, not by delta attribution: a
closed window has one recorded peak, not a series, so there are no rises to
allocate. The two tables can therefore disagree on the same window — that is
the method difference, not a bug.

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
`splitByShare` — i.e. the budget-slice rule above, the delta attribution
(rise-per-interval, UNATTRIBUTED, the reading merge, the no-points fallback)
and the cost weighting that feeds it, including the window bounds, the fold
and the zero-cost case. Run
`bun run test` in `apps/web`. Keep new math in `lib/usage/` as a pure function
with a test; routes and components consume it.
