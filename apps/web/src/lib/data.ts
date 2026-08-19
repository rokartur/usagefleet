import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '@/db'
import {
	claudeAccounts,
	devices,
	groups,
	limitChangePoints,
	limitSamples,
	usageEvents,
	userSettings,
} from '@/db/schema'
import type { ClaudeAccount as ClaudeAccountRow, LimitWindow, PointWindow, StoredModelLimit } from '@/db/schema'
import { createPromiseCache } from '@/lib/promise-cache'
import {
	billableTokens,
	costForTokens,
	costUsd,
	EMPTY_TOTALS,
	filterByWindow,
	fitCalibration,
	foldEvents,
	modelBreakdown,
	modelLabel,
	monthKey,
	PROJECT_DAYS,
	refreshPrices,
	sumTokens,
	weekWindowStart,
	weightedCost,
	windowSpans,
} from '@/lib/usage'
import type { CacheTtl, Calibration, DailyAggRow, ModelUsage, TokenTotals, UsageRecord, WindowSpan } from '@/lib/usage'

// The logical-message fold key: (messageId, requestId) when present, else the
// row's own uuid. Prefixed so a uuid can never collide with a messageId pair.
const FOLD_KEY = sql`CASE WHEN ${usageEvents.messageId} IS NOT NULL THEN 'm:' || ${usageEvents.messageId} || '::' || coalesce(${usageEvents.requestId}, '') ELSE 'u:' || ${usageEvents.uuid} END`
// The first cast widens the whole addition to bigint. The ingest cap keeps new
// rows well inside int4, but rows stored under the older, looser cap can still
// overflow this sum — and it orders every DISTINCT ON, so one bad row would
// raise `integer out of range` on that user's every dashboard, history and guard
// query, permanently and with no way to delete it from the app.
const ROW_TOTAL = sql`(${usageEvents.inputTokens}::bigint + ${usageEvents.outputTokens} + ${usageEvents.cacheCreationTokens} + ${usageEvents.cacheReadTokens})`

/** The columns of `user_settings` anything actually reads. The rest of the table
 *  is dead weight kept only because dropping columns is one-way (see
 *  db/schema.ts), and a bare `select()` would ship all of it to the browser on
 *  every dashboard load — `settings` is returned wholesale by the settings route.
 *  `freeDeviceLimit` is absent on purpose: billing.ts and the admin panel read it
 *  with their own narrow selects. */
const SETTINGS_COLS = {
	cacheWriteTtl: userSettings.cacheWriteTtl,
	userId: userSettings.userId,
	weekResetHourUtc: userSettings.weekResetHourUtc,
	weekResetWeekday: userSettings.weekResetWeekday,
}

/** Lazily create and return the user's settings row. */
export async function ensureSettings(userId: string) {
	const existing = await db.select(SETTINGS_COLS).from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
	if (existing[0]) {
		return existing[0]
	}
	const inserted = await db.insert(userSettings).values({ userId }).onConflictDoNothing().returning(SETTINGS_COLS)
	return (
		inserted[0] ??
		(await db.select(SETTINGS_COLS).from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0]
	)
}

/**
 * Folded events for a user at or after `cutoff`, joined to their device's group.
 *
 * The fold — collapse streamed segments to the largest row per logical message,
 * see fold.ts — runs IN SQL, the same DISTINCT ON as `loadDailyAggregates`.
 * Claude Code writes one row per streamed segment, so a fleet's raw row count is
 * an order of magnitude above its message count, and this is a per-request path
 * (the 5s dashboard poll, plus the collector guard on every prompt): folding in
 * Node meant shipping every segment over the wire to throw most of them away.
 *
 * Per-message is as far as this can aggregate. The callers slice these rows by
 * several different windows (5h, weekly, one per model limit) and weigh them by
 * per-model cost, so they need the timestamp and model of each message.
 *
 * Callers still fold; see the note at that call site for why.
 */
export async function loadRecentEvents(userId: string, cutoff: Date, accountId?: string): Promise<UsageRecord[]> {
	const result = await db.execute(sql`
    SELECT DISTINCT ON (${FOLD_KEY})
      ${usageEvents.uuid} AS uuid,
      ${usageEvents.messageId} AS message_id,
      ${usageEvents.requestId} AS request_id,
      ${usageEvents.model} AS model,
      ${usageEvents.source} AS source,
      ${usageEvents.ts} AS ts,
      ${usageEvents.deviceId} AS device_id,
      d.group_id AS group_id,
      ${usageEvents.inputTokens} AS input_tokens,
      ${usageEvents.outputTokens} AS output_tokens,
      ${usageEvents.cacheCreationTokens} AS cache_creation_tokens,
      ${usageEvents.cacheCreation5mTokens} AS cache_creation_5m,
      ${usageEvents.cacheCreation1hTokens} AS cache_creation_1h,
      ${usageEvents.cacheReadTokens} AS cache_read_tokens
    FROM ${usageEvents}
    JOIN ${devices} d ON d.id = ${usageEvents.deviceId}
    WHERE ${usageEvents.userId} = ${userId}
      AND ${usageEvents.ts} >= ${cutoff.toISOString()}::timestamptz
      ${accountId ? sql`AND d.claude_account_id = ${accountId}` : sql``}
    ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
  `)

	const rows = result as unknown as {
		uuid: string
		message_id: string | null
		request_id: string | null
		model: string | null
		source: string | null
		// Measured against postgres:17, not assumed: postgres-js on its own decodes
		// timestamptz to a Date, but through drizzle's `db.execute` the row comes back
		// undecoded, as wire text ('2026-06-18 12:00:00+00'). The union matches what
		// this file already does for the same kind of raw column (`last_ts` below) and
		// keeps `new Date()` correct if that ever changes — declaring it `Date` alone
		// typechecks and then throws at the first `e.ts.getTime()` in splitByShare,
		// i.e. on every dashboard load. int4 does arrive as a number, so it is not
		// wrapped.
		ts: string | Date
		device_id: string | null
		group_id: string | null
		input_tokens: number
		output_tokens: number
		cache_creation_tokens: number
		cache_creation_5m: number | null
		cache_creation_1h: number | null
		cache_read_tokens: number
	}[]
	// Null TTL breakdown → 0: pricing treats the untagged remainder (total minus
	// tagged) as "price by the user's TTL setting", so 0 means exactly "legacy row".
	return rows.map(r => ({
		cacheCreation1hTokens: r.cache_creation_1h ?? 0,
		cacheCreation5mTokens: r.cache_creation_5m ?? 0,
		cacheCreationTokens: r.cache_creation_tokens,
		cacheReadTokens: r.cache_read_tokens,
		deviceId: r.device_id,
		groupId: r.group_id,
		inputTokens: r.input_tokens,
		messageId: r.message_id,
		model: r.model,
		outputTokens: r.output_tokens,
		requestId: r.request_id,
		source: r.source,
		ts: new Date(r.ts),
		uuid: r.uuid,
	}))
}

/**
 * Folded, per-(UTC day × group × model) token aggregates — the cheap foundation
 * for the day / month / all-time usage figures.
 *
 * Folding (collapse streamed segments to the largest per logical message — see
 * fold.ts) is done IN SQL via DISTINCT ON so the whole table never has to be
 * pulled into Node: the result is one small row per active (day, group, model)
 * cell. Rows with no real tokens (e.g. "<synthetic>" placeholders) are dropped
 * by the HAVING clause. Days are bucketed in UTC to match the JS day keys
 * (`utcDay` in chart.ts), so a row and its chart bucket can never disagree.
 *
 * `since` bounds the scan (UTC, inclusive). Unbounded, this walks and sorts the
 * account's entire event history, so `cachedDailyRows` is the only caller that
 * omits it — it backs the all-time view, which has no smaller question to ask,
 * and puts a 60s cache in front rather than running the scan per request.
 */
export async function loadDailyAggregates(userId: string, since?: Date): Promise<DailyAggRow[]> {
	const result = await db.execute(sql`
    WITH folded AS (
      SELECT DISTINCT ON (${FOLD_KEY})
        ${usageEvents.ts} AS ts,
        ${usageEvents.deviceId} AS device_id,
        ${usageEvents.model} AS model,
        ${usageEvents.source} AS source,
        ${usageEvents.inputTokens} AS input_tokens,
        ${usageEvents.outputTokens} AS output_tokens,
        ${usageEvents.cacheCreationTokens} AS cache_creation_tokens,
        ${usageEvents.cacheCreation5mTokens} AS cache_creation_5m,
        ${usageEvents.cacheCreation1hTokens} AS cache_creation_1h,
        ${usageEvents.cacheReadTokens} AS cache_read_tokens
      FROM ${usageEvents}
      WHERE ${usageEvents.userId} = ${userId}
        ${since ? sql`AND ${usageEvents.ts} >= ${since.toISOString()}::timestamptz` : sql``}
      ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
    )
    SELECT
      to_char(date_trunc('day', folded.ts AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      d.group_id AS group_id,
      folded.model AS model,
      folded.source AS source,
      folded.device_id AS device_id,
      sum(folded.input_tokens)::bigint AS input,
      sum(folded.output_tokens)::bigint AS output,
      sum(folded.cache_creation_tokens)::bigint AS cache_creation,
      sum(coalesce(folded.cache_creation_5m, 0))::bigint AS cache_creation_5m,
      sum(coalesce(folded.cache_creation_1h, 0))::bigint AS cache_creation_1h,
      sum(folded.cache_read_tokens)::bigint AS cache_read
    FROM folded
    JOIN ${devices} d ON d.id = folded.device_id
    GROUP BY 1, 2, 3, 4, 5
    HAVING (
      sum(folded.input_tokens) + sum(folded.output_tokens) +
      sum(folded.cache_creation_tokens) + sum(folded.cache_read_tokens)
    ) > 0
  `)

	const rows = result as unknown as {
		day: string
		group_id: string | null
		model: string | null
		source: string | null
		device_id: string | null
		input: string
		output: string
		cache_creation: string
		cache_creation_5m: string
		cache_creation_1h: string
		cache_read: string
	}[]
	return rows.map(r => ({
		cacheCreation1hTokens: Number(r.cache_creation_1h),
		cacheCreation5mTokens: Number(r.cache_creation_5m),
		cacheCreationTokens: Number(r.cache_creation),
		cacheReadTokens: Number(r.cache_read),
		day: r.day,
		deviceId: r.device_id,
		groupId: r.group_id,
		inputTokens: Number(r.input),
		model: r.model,
		outputTokens: Number(r.output),
		source: r.source,
	}))
}

export interface LiveGroupUsage {
	groupId: string | null
	name: string
	color: string
	/** Usage measured against the group's budget slice (an equal share of the
	 *  account limit) — the "am I eating the other group's half?" view. */
	sessionBudgetPct: number
	weeklyBudgetPct: number
	sessionTokens: number
	weeklyTokens: number
	/** All-bucket totals (incl. cache_read) — comparable with ccusage's Total. */
	sessionTotalTokens: number
	weeklyTotalTokens: number
	/** Which models the group used (and precise token counts) over the 5h
	 *  session window. */
	sessionModels: ModelUsage[]
	/** Which models the group used over the weekly window — the broader, more
	 *  stable view than the 5h session. */
	models: ModelUsage[]
}

/** Token totals + USD cost (at public API list prices) for one spend period. */
export interface SpendPeriod {
	totals: TokenTotals
	costUsd: number
}

/** Money spent over the current weekly window and the current UTC calendar
 *  month. Cost is accrued per model (rates differ), then summed. */
export interface Spend {
	week: SpendPeriod
	month: SpendPeriod
}

const emptySpend = (): Spend => ({
	month: { costUsd: 0, totals: { ...EMPTY_TOTALS } },
	week: { costUsd: 0, totals: { ...EMPTY_TOTALS } },
})

/** One group's slice of a per-model official limit. */
export interface LiveModelLimitGroup {
	groupId: string | null
	name: string
	color: string
	/** Against the group's equal budget slice, like sessionBudgetPct. */
	budgetPct: number
	/** Billable tokens of this model family in the limit's window. */
	tokens: number
}

/** A per-model official limit (e.g. the Fable weekly cap) with the same
 *  local-token-share group split as the session/weekly limits. */
export interface LiveModelLimit {
	/** Model family key from the rate-limit header ("fable", "opus"). */
	model: string
	/** Friendly label ("Fable"). */
	label: string
	/** Window key from the header ("5h", "7d"). */
	window: string
	/** Claude's official utilization for this model limit. */
	pct: number
	resetsAt: Date | null
	groups: LiveModelLimitGroup[]
}

export interface LiveDashboard {
	/** The Anthropic account these figures belong to. Null only before any
	 *  collector has reported a login, i.e. the setup state. */
	accountId: string | null
	/** Email of the Claude login, falling back to the org name. Null for the
	 *  bucket holding devices whose login we can't identify. */
	accountLabel: string | null
	/** True once the collector has reported real utilization at least once. */
	connected: boolean
	source: 'sub' | 'api' | null
	reportedAt: Date | null
	fiveHourPct: number
	sevenDayPct: number
	fiveHourResetsAt: Date | null
	sevenDayResetsAt: Date | null
	groups: LiveGroupUsage[]
	/** Per-model official limits (e.g. Fable weekly), group-split like above. */
	modelLimits: LiveModelLimit[]
	/** Money spent this week (weekly window) and this calendar month. */
	spend: Spend
}

const HOUR_MS = 60 * 60 * 1000
const FIVE_H_MS = 5 * HOUR_MS
const SEVEN_D_MS = 7 * 24 * HOUR_MS

/** Duration of a rate-limit window key ("5h", "7d", …); null when unparseable.
 *  Months are approximated as 30 days — only the split window, not limit math. */
function windowDurationMs(window: string): number | null {
	const m = window.match(/^(\d+)([hdwm])$/)
	if (!m) {
		return null
	}
	const n = Number(m[1])
	const unit =
		m[2] === 'h' ? HOUR_MS : m[2] === 'd' ? 24 * HOUR_MS : m[2] === 'w' ? 7 * 24 * HOUR_MS : 30 * 24 * HOUR_MS
	return n * unit
}

/** Scale an account-share pct to a per-group budget pct — every group that
 *  exists is budgeted an equal slice (1/groupCount) of the account limit, so
 *  with 2 groups one at its half reads 100% while the account is at 50%.
 *  Uncapped: past 100% the group has overrun its slice and is eating another
 *  group's, which is worth seeing. Takes the *unrounded* share so the multiply
 *  doesn't amplify a rounding error (at 10 groups 0.5pt would become 5pt). */
export const groupBudgetPct = (share: { exactPct: number } | undefined, groupCount: number) =>
	Math.round((share?.exactPct ?? 0) * groupCount)

/** A recorded reading of the official percentage at an instant. The rise
 *  between two readings is what delta attribution splits. */
export interface PctPoint {
	at: Date
	pct: number
}

/** Sentinel share key for official-percentage rises no monitored event can
 *  explain: usage from before the collector ran, or from a device outside the
 *  fleet (phone, unenrolled machine). Group ids are uuids, so no collision. */
export const UNATTRIBUTED = '__unattributed__'

/** Grid a limit sample's window start is snapped to — see recordLimitSample. */
const SAMPLE_GRID_MS = 5 * 60 * 1000

/** Readings closer together than this merge into one attribution interval.
 *  Every device polls Anthropic once a minute and posts what it read, so two
 *  readings inside one minute are the same moment seen by two machines and the
 *  boundary between them is noise, not information.
 *
 *  This used to be five minutes, to absorb an unmeasured delay between an
 *  event's timestamp and Anthropic's meter. Measured on real accounts, that
 *  delay is under a minute — while the five-minute bound was dropping ~25% of
 *  all recorded rises and, worse, merging idle intervals into active ones,
 *  which hid off-fleet usage that should have read as {@link UNATTRIBUTED}.
 *  What remains of the delay is fitted per account instead
 *  ({@link Calibration.lagMs}), which is falsifiable where a constant is not. */
const MERGE_INTERVAL_MS = 60 * 1000

/** Start of a window of exactly `len` ending at `now`. `resetsAt` is whatever
 *  the collector reported, and it is range-checked nowhere on the way in, so
 *  two ways of being wrong are handled here: stale (already past) clamps to the
 *  rolling window, and further ahead than one whole window means it is not this
 *  window's reset at all, which would otherwise produce a window starting in the
 *  future — empty, so the entire account pct would read as unattributed. */
export function windowStartOf(resetsAt: Date | null, now: Date, len: number): Date {
	const usable = resetsAt && resetsAt.getTime() <= now.getTime() + len ? resetsAt.getTime() - len : 0
	return new Date(Math.max(usable, now.getTime() - len))
}

/** Whether a reading opens a new change point, given the last one stored for the
 *  same window (undefined when it is the window's first).
 *
 *  Only rises are recorded. Anthropic's utilization does not fall inside a
 *  window, so a fall means two devices on this account read the endpoint moments
 *  apart and their posts landed out of order (the timestamp is receipt time).
 *  Storing that dip would make the recovery back to the true value read as an
 *  extra rise, inflating the denominator and diluting every real group. A reset
 *  needs no row: the caller scopes `prev` to the current window and riseWeights
 *  anchors each window at 0. The tolerance covers `real`-column float32
 *  round-tripping; readings carry one decimal.
 *
 *  Every rise is stored. Readings too close together to attribute separately
 *  are merged at read time ({@link MERGE_INTERVAL_MS}) rather than dropped
 *  here, so a later, better-calibrated read can still use them — and so the
 *  series stays the account's full-resolution record of what Anthropic said.
 *  Duplicate posts cost nothing: repeated devices report the same pct, which
 *  is not a rise. */
export function shouldRecordPoint(prev: { pct: number } | undefined, pct: number): boolean {
	return !prev || pct - prev.pct >= 0.05
}

/**
 * Weight per share key from recorded rises of the official percentage: each
 * rise between two readings is split by the cost of the events inside that
 * interval, so a percentage point is charged to whoever was active when it was
 * actually burned instead of being smeared over the whole window by cost. A
 * rise over an interval with no priceable events goes to {@link UNATTRIBUTED}.
 *
 * The window opens at 0% by definition, which anchors the first rise; a final
 * synthetic reading at (`now`, `targetPct`) carries any rise the account row
 * already shows but no change point recorded yet — which also makes the
 * no-points case degrade to exactly the whole-window cost split.
 *
 * `lagMs` shifts every event forward by how long this account's own history
 * says its tokens take to reach Anthropic's meter, so a rise is matched with
 * the work that caused it rather than with whatever was running when it
 * surfaced.
 *
 * Returns null when there is no rise to weigh; callers then fall back to the
 * plain cost split.
 */
function riseWeights(
	timeline: { ts: number; key: string | null; cost: number }[],
	points: PctPoint[],
	windowStart: Date,
	now: Date,
	targetPct: number,
	lagMs: number,
): Map<string | null, number> | null {
	const startMs = windowStart.getTime()
	const nowMs = now.getTime()
	let last = { at: startMs, pct: 0 }
	const bounds = [last]
	for (const p of points
		.filter(p => p.at.getTime() > startMs && p.at.getTime() <= nowMs)
		.toSorted((a, b) => a.at.getTime() - b.at.getTime())) {
		// Merging: a reading inside the minimum interval is dropped and its rise
		// carries forward to the next kept reading (or the synthetic final one).
		if (p.at.getTime() - last.at >= MERGE_INTERVAL_MS) {
			last = { at: p.at.getTime(), pct: p.pct }
			bounds.push(last)
		}
	}
	if (targetPct > last.pct) {
		// The tail rise the account row already shows but no reading recorded yet.
		// Inside the merge interval it extends the last interval rather than opening
		// the hairline one the merging above exists to prevent — safe to move the
		// bound here because this happens once, so it cannot chain.
		if (bounds.length > 1 && nowMs - last.at < MERGE_INTERVAL_MS) {
			last.at = nowMs
			last.pct = targetPct
		} else {
			bounds.push({ at: nowMs, pct: targetPct })
		}
	}
	const events = timeline.toSorted((a, b) => a.ts - b.ts)
	const weights = new Map<string | null, number>()
	let totalRise = 0
	let i = 0
	for (let b = 1; b < bounds.length; b++) {
		const end = bounds[b].at
		const rise = bounds[b].pct - bounds[b - 1].pct
		// Events are consumed even when the rise is <= 0 (a downward correction):
		// they explain no rise and must not leak into the next interval.
		const from = i
		while (i < events.length && events[i].ts + lagMs <= end) {
			i += 1
		}
		if (rise <= 0) {
			continue
		}
		totalRise += rise
		let costSum = 0
		for (let e = from; e < i; e++) {
			costSum += events[e].cost
		}
		if (costSum === 0) {
			weights.set(UNATTRIBUTED, (weights.get(UNATTRIBUTED) ?? 0) + rise)
			continue
		}
		for (let e = from; e < i; e++) {
			const { cost, key } = events[e]
			weights.set(key, (weights.get(key) ?? 0) + rise * (cost / costSum))
		}
	}
	return totalRise > 0 ? weights : null
}

interface ShareEntry {
	/** This key's share of the official pct, unrounded — scaled to a budget pct
	 *  before display, so rounding happens once, at the end. */
	exactPct: number
	tokens: number
	/** All-bucket total (incl. cache_read); display only, never used for splits. */
	totalTokens: number
	models: ModelUsage[]
}

/** Split an official account-wide percentage across an arbitrary key (group or
 *  device). With recorded {@link PctPoint}s, each rise is attributed to the
 *  keys active in its interval ({@link riseWeights}); without them (or with no
 *  rise), the whole percentage is split by each key's share of estimated cost
 *  (API list prices) within the window — weighting buckets (output 5×, cache
 *  write 1.25×, cache read 0.1×) and models (Fable > Opus > Sonnet > Haiku)
 *  like Anthropic's cost-based limit accounting. Token fields stay
 *  billable/total for display.
 *
 *  `calibration` replaces those list prices with what this account's own rises
 *  say Anthropic actually charges, and shifts events by its measured meter lag.
 *  Absent (or never fitted well enough to keep) the list prices stand.
 *
 *  The returned map may carry an extra {@link UNATTRIBUTED} entry — a share of
 *  the account with no group behind it. It is not a group: it holds no budget
 *  slice, so it must not go through {@link groupBudgetPct}. */
export function splitByShare(
	events: UsageRecord[],
	windowStart: Date,
	now: Date,
	officialPct: number,
	ttl: CacheTtl,
	points?: PctPoint[],
	calibration?: Calibration | null,
): Map<string | null, ShareEntry> {
	const byKey = new Map<string | null, UsageRecord[]>()
	for (const e of filterByWindow(events, windowStart, now)) {
		const k = e.groupId ?? null
		const arr = byKey.get(k)
		if (arr) {
			arr.push(e)
		} else {
			byKey.set(k, [e])
		}
	}
	const tokensByKey = new Map<string | null, number>()
	const totalByKey = new Map<string | null, number>()
	const costByKey = new Map<string | null, number>()
	const modelsByKey = new Map<string | null, ModelUsage[]>()
	// Per-message cost with its timestamp, across all keys — what riseWeights
	// slices into attribution intervals.
	const timeline: { ts: number; key: string | null; cost: number }[] = []
	let totalCost = 0
	for (const [k, evs] of byKey) {
		// Kept even though loadRecentEvents already folds in SQL: this is an exported
		// function tested over unfolded input, and "never SUM raw rows" fails silently
		// rather than loudly. foldEvents is idempotent, so on folded input it costs one
		// Map pass.
		const folded = foldEvents(evs)
		const totals = sumTokens(folded)
		tokensByKey.set(k, billableTokens(totals))
		totalByKey.set(k, totals.totalTokens)
		let cost = 0
		for (const e of folded) {
			const c = calibration ? weightedCost(e, ttl, calibration.weights) : costUsd(e, ttl)
			cost += c
			timeline.push({ cost: c, key: k, ts: e.ts.getTime() })
		}
		costByKey.set(k, cost)
		// `folded`, not `evs`: modelBreakdown folds internally anyway, so handing it
		// the raw list just refolds what the line above already did.
		modelsByKey.set(k, modelBreakdown(folded))
		totalCost += cost
	}
	const target = Math.max(0, officialPct)
	const rise = points ? riseWeights(timeline, points, windowStart, now, target, calibration?.lagMs ?? 0) : null
	// Weights sum to the total recorded rise; normalizing to `target` keeps the
	// official percentage authoritative even after a downward correction.
	let totalWeight = 0
	if (rise) {
		for (const w of rise.values()) {
			totalWeight += w
		}
		// A sliver under half a point is timing noise, not a device off the fleet —
		// dropped from the denominator too, so the real keys still sum to `target`.
		const sliver = rise.get(UNATTRIBUTED) ?? 0
		if (sliver > 0 && target * (sliver / totalWeight) < 0.5) {
			rise.delete(UNATTRIBUTED)
			totalWeight -= sliver
		}
	}
	const shareOf = (k: string | null) => {
		if (rise && totalWeight > 0) {
			return target * ((rise.get(k) ?? 0) / totalWeight)
		}
		return totalCost > 0 ? target * ((costByKey.get(k) ?? 0) / totalCost) : 0
	}

	const out = new Map<string | null, ShareEntry>()
	for (const [k, tok] of tokensByKey) {
		out.set(k, {
			exactPct: shareOf(k),
			models: modelsByKey.get(k) ?? [],
			tokens: tok,
			totalTokens: totalByKey.get(k) ?? 0,
		})
	}
	if (rise?.has(UNATTRIBUTED)) {
		out.set(UNATTRIBUTED, { exactPct: shareOf(UNATTRIBUTED), models: [], tokens: 0, totalTokens: 0 })
	}
	return out
}

/** One Anthropic account's slice of a user's fleet: the account row plus the
 *  rule for which of the user's devices count against it. */
export interface AccountView {
	/** Null only for a user no collector has reported for yet. */
	account: ClaudeAccountRow | null
	userId: string
	/** A device is stamped with an account on its first limits post. Rows from
	 *  never-stamped devices (API-key logins, fresh installs, collectors older
	 *  than multi-account) fold into the unidentified bucket — or into the only
	 *  account there is, so a single-account fleet always adds up. */
	absorbsUnstamped: boolean
}

/** Does a device belong to this account's view? */
export function inAccount(view: AccountView, deviceAccountId: string | null): boolean {
	return deviceAccountId === (view.account?.id ?? null) || (deviceAccountId === null && view.absorbsUnstamped)
}

/** {@link inAccount} as a predicate over a joined `devices d`, for the raw
 *  aggregate queries that fold in SQL and so can't filter afterwards. */
function accountFilterSql(view: AccountView): SQL {
	const id = view.account?.id ?? null
	if (id === null) {
		return sql`d.claude_account_id IS NULL`
	}
	return view.absorbsUnstamped
		? sql`(d.claude_account_id = ${id} OR d.claude_account_id IS NULL)`
		: sql`d.claude_account_id = ${id}`
}

/**
 * Every Anthropic account this user's fleet reports on. Always at least one
 * entry: a user whose collectors have never reported gets a placeholder view so
 * the dashboard still renders its setup state.
 *
 * The unidentified bucket sorts first, which makes `[0]` the account that
 * absorbs unstamped devices — the guard relies on that.
 *
 * Only accounts a live device is on get a view. A row nothing points at is a
 * leftover — the device that made it moved to an identified account, or was
 * revoked — and it would otherwise keep drawing a card with stale percentages
 * and no groups under it.
 */
export async function listAccountViews(userId: string): Promise<AccountView[]> {
	const [rows, deviceAccounts] = await Promise.all([
		db.select().from(claudeAccounts).where(eq(claudeAccounts.userId, userId)),
		db
			.selectDistinct({ accountId: devices.claudeAccountId })
			.from(devices)
			.where(and(eq(devices.userId, userId), eq(devices.revoked, false))),
	])
	const liveOn = new Set(deviceAccounts.map(d => d.accountId))
	return accountViews(
		// The bucket also answers for devices that never reported a login.
		rows.filter(a => liveOn.has(a.id) || (a.extId === null && liveOn.has(null))),
		userId,
	)
}

/** {@link listAccountViews} minus the query. */
export function accountViews(rows: ClaudeAccountRow[], userId: string): AccountView[] {
	if (rows.length === 0) {
		return [{ absorbsUnstamped: true, account: null, userId }]
	}
	const sorted = rows.toSorted((a, b) => {
		if ((a.extId === null) !== (b.extId === null)) {
			return a.extId === null ? -1 : 1
		}
		return a.createdAt.getTime() - b.createdAt.getTime()
	})
	const only = sorted.length === 1
	return sorted.map(account => ({ absorbsUnstamped: only || account.extId === null, account, userId }))
}

/**
 * Real utilization of ONE Anthropic account as last reported by a collector
 * (which reads it from the local Claude Code login), with a local token-share
 * split per group. `connected: false` until a collector has reported once.
 */
async function loadLiveDashboard(
	view: AccountView,
	now: Date,
	shared: () => ReturnType<typeof loadSharedRows>,
): Promise<LiveDashboard> {
	const { userId } = view
	const acct = view.account
	const settings = await ensureSettings(userId)
	const hasLimits = acct != null && (acct.fiveHourPct !== null || acct.sevenDayPct !== null)

	const clampPct = (v: number | null | undefined) => Math.min(100, Math.max(0, v ?? 0))
	const base = {
		accountId: acct?.id ?? null,
		accountLabel: acct?.email ?? acct?.orgName ?? null,
		fiveHourPct: clampPct(acct?.fiveHourPct),
		fiveHourResetsAt: acct?.fiveHourResetsAt ? new Date(acct.fiveHourResetsAt) : null,
		reportedAt: acct?.limitsReportedAt ? new Date(acct.limitsReportedAt) : null,
		sevenDayPct: clampPct(acct?.sevenDayPct),
		sevenDayResetsAt: acct?.sevenDayResetsAt ? new Date(acct.sevenDayResetsAt) : null,
		source: (acct?.limitSource as 'sub' | 'api' | null) ?? null,
	}

	if (!hasLimits) {
		return {
			connected: false,
			groups: [],
			modelLimits: [],
			spend: emptySpend(),
			...base,
		}
	}

	const fiveStart = windowStartOf(base.fiveHourResetsAt, now, FIVE_H_MS)
	const weekStart = windowStartOf(base.sevenDayResetsAt, now, SEVEN_D_MS)

	// Per-model limit windows (e.g. Fable weekly), clamped the same way. Entries
	// with no reported pct can't be split — drop them up front.
	const modelWindows = (acct.modelLimits ?? [])
		.filter((m): m is StoredModelLimit & { pct: number } => m.pct != null)
		.map(m => {
			const dur = windowDurationMs(m.window) ?? SEVEN_D_MS
			const parsed = m.resetsAt ? new Date(m.resetsAt) : null
			const resetsAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
			return { entry: m, resetsAt, start: windowStartOf(resetsAt, now, dur) }
		})

	// The shared flight loads a superset window (see getLiveDashboards); every
	// consumer below filters to its exact window, so the wider bound only costs
	// scan range, never correctness. The change points ride alongside: they are
	// per account, so they can't live in the shared flight. Bound at the earlier
	// of the window starts — fresh after a weekly reset `weekStart` is only
	// minutes old while `fiveStart` is hours back, so bounding on the weekly one
	// would silently truncate the 5h series, and a per-model window can start
	// earlier than both. riseWeights clips each split to its own window anyway.
	const pointsFrom = new Date(
		Math.min(weekStart.getTime(), fiveStart.getTime(), ...modelWindows.map(m => m.start.getTime())),
	)
	const [[allEvents, groupRows, allAggRows, deviceRows], pointRows] = await Promise.all([
		shared(),
		db
			.select({
				at: limitChangePoints.at,
				model: limitChangePoints.model,
				pct: limitChangePoints.pct,
				window: limitChangePoints.window,
			})
			.from(limitChangePoints)
			.where(and(eq(limitChangePoints.claudeAccountId, acct.id), gte(limitChangePoints.at, pointsFrom)))
			.orderBy(asc(limitChangePoints.at)),
	])
	// The model filter is not optional: one table holds both series, so dropping it
	// would feed a model family's rises into the account headline and back.
	const pointsFor = (w: PointWindow, model = '') => pointRows.filter(p => p.window === w && p.model === model)

	// Usage belongs to the account its device is signed into *now*, the same way
	// it already follows a device between groups.
	const myDevices = deviceRows.filter(d => inAccount(view, d.claudeAccountId))
	const mine = new Set(myDevices.map(d => d.id))
	// Both loaders inner-join devices, so a null deviceId here is only a typing
	// artifact of the join.
	const events = allEvents.filter(e => e.deviceId != null && mine.has(e.deviceId))
	const aggRows = allAggRows.filter(r => r.deviceId !== null && mine.has(r.deviceId))

	// Every group with a LIVE device on this account claims an equal slice of
	// that account's limit — a group that never touches this subscription can't
	// spend its budget, and a group whose only device was revoked stops claiming
	// one (its historical events still count in the split above). The "Ungrouped"
	// row is divided by that same count without being counted in it, so when
	// loose devices exist the displayed slices deliberately over-allocate rather
	// than shrink every real group to make room for them.
	const budgetShares = Math.max(
		1,
		new Set(myDevices.filter(d => !d.revoked && d.groupId !== null).map(d => d.groupId)).size,
	)
	const ttl: CacheTtl = settings.cacheWriteTtl === '1h' ? '1h' : '5m'
	const calibration = acct?.calibration ?? null
	const sessionSplit = splitByShare(events, fiveStart, now, base.fiveHourPct, ttl, pointsFor('5h'), calibration)
	const weeklySplit = splitByShare(events, weekStart, now, base.sevenDayPct, ttl, pointsFor('7d'), calibration)

	const keys = new Set<string | null>([...sessionSplit.keys(), ...weeklySplit.keys()])
	const labelFor = (id: string | null) => {
		if (id === UNATTRIBUTED) {
			return { color: '#64748b', name: 'Unattributed' }
		}
		const g = id === null ? undefined : groupRows.find(g => g.id === id)
		return { color: g?.color ?? '#94a3b8', name: id === null ? 'Ungrouped' : (g?.name ?? 'Unknown') }
	}
	// Unattributed is not a group and holds no budget slice, so it stays on the
	// account scale; scaling it by the group count would show a 15% remainder as
	// 60% on a four-group account and push the split bar past the real total.
	const budgetPctFor = (id: string | null, s: ShareEntry | undefined) =>
		id === UNATTRIBUTED ? Math.round(s?.exactPct ?? 0) : groupBudgetPct(s, budgetShares)

	const groupUsages: LiveGroupUsage[] = [...keys].map(id => ({
		groupId: id,
		...labelFor(id),
		// Usage against the group's equal slice of the account limit: a group
		// filling its share reads 100% while the account is at 50%.
		sessionBudgetPct: budgetPctFor(id, sessionSplit.get(id)),
		weeklyBudgetPct: budgetPctFor(id, weeklySplit.get(id)),
		sessionTokens: sessionSplit.get(id)?.tokens ?? 0,
		weeklyTokens: weeklySplit.get(id)?.tokens ?? 0,
		sessionTotalTokens: sessionSplit.get(id)?.totalTokens ?? 0,
		weeklyTotalTokens: weeklySplit.get(id)?.totalTokens ?? 0,
		// Model breakdowns per window (each matches that window's token figure).
		sessionModels: sessionSplit.get(id)?.models ?? [],
		models: weeklySplit.get(id)?.models ?? [],
	}))
	groupUsages.sort((a, b) => b.weeklyTokens - a.weeklyTokens)

	// Per-model official limits: split each model cap across groups over the
	// limit's own window, on that family's own change points — the same delta
	// attribution (and per-group budget scaling) as the session/weekly limits
	// above, falling back to plain cost share until a family has points.
	const modelLimits: LiveModelLimit[] = modelWindows.map(({ entry, start, resetsAt }) => {
		const familyEvents = events.filter(e => (e.model ?? '').toLowerCase().includes(entry.model))
		const split = splitByShare(
			familyEvents,
			start,
			now,
			entry.pct,
			ttl,
			pointsFor(entry.window, entry.model),
			calibration,
		)
		const groupRowsFor: LiveModelLimitGroup[] = [...split.entries()].map(([id, s]) => ({
			// Via budgetPctFor, not groupBudgetPct: delta attribution can emit the
			// UNATTRIBUTED sentinel, which must never reach the budget scaling.
			budgetPct: budgetPctFor(id, s),
			groupId: id,
			...labelFor(id),
			tokens: s.tokens,
		}))
		groupRowsFor.sort((a, b) => b.tokens - a.tokens)
		return {
			groups: groupRowsFor,
			label: modelLabel(entry.model),
			model: entry.model,
			// Not capped at 100: Anthropic keeps counting past a model cap and
			// "105%" is the number worth seeing. Floor at 0 only.
			pct: Math.max(0, entry.pct),
			resetsAt,
			window: entry.window,
		}
	})

	// Weekly-window spend: fold once, then price each logical message by its own
	// model. Monthly spend comes from the pre-folded daily aggregates, priced per
	// (day × group × model) cell the same way.
	const weeklyFolded = foldEvents(filterByWindow(events, weekStart, now))
	const monthK = monthKey(now)
	// Redundant while the shared load bounds aggRows to the same month, and kept
	// so this stays correct if that bound is ever widened.
	const monthRows = aggRows.filter(r => r.day.startsWith(monthK))
	const spend: Spend = {
		month: {
			costUsd: monthRows.reduce((s, r) => s + costForTokens(r, r.model, ttl), 0),
			totals: sumTokens(monthRows),
		},
		week: {
			costUsd: weeklyFolded.reduce((s, e) => s + costUsd(e, ttl), 0),
			totals: sumTokens(weeklyFolded),
		},
	}

	return {
		connected: true,
		groups: groupUsages,
		modelLimits,
		spend,
		...base,
	}
}

/**
 * One flight's user-scoped loads, shared by every account view: the two
 * whole-user scans (recent events + current-month daily aggregates) plus the
 * group and device lists are identical per view, so a fleet split over two
 * subscriptions pays the biggest hot-path scan once, not once per account.
 * The aggregate scan is bounded to the current month — the only thing spend
 * takes from it — and both sides bucket in UTC, so the bound is exact.
 *
 * refreshPrices rides along because it has to finish BEFORE splitByShare: that
 * split is cost-weighted, so pricing every event off the fallback tiers would
 * hand the first dashboard of a cold process a different answer than the next
 * poll gives. It is a no-op after the first call.
 */
function loadSharedRows(userId: string, earliest: Date, monthStart: Date) {
	return Promise.all([
		loadRecentEvents(userId, earliest),
		db.select().from(groups).where(eq(groups.ownerId, userId)),
		loadDailyAggregates(userId, monthStart),
		db
			.select({
				claudeAccountId: devices.claudeAccountId,
				groupId: devices.groupId,
				id: devices.id,
				revoked: devices.revoked,
			})
			.from(devices)
			.where(eq(devices.userId, userId)),
		refreshPrices(),
	])
}

/**
 * Cached {@link loadLiveDashboard}. Every open tab polls this every 5s and every
 * device asks for it before every prompt, while the load underneath reads each
 * raw usage row in the window — Claude Code writes one per streamed segment, so
 * that is the largest scan on any hot path. Caching the promise collapses a
 * burst of tabs and devices onto a single flight per account.
 *
 * `now` is taken when the flight starts, so a hit can be up to the TTL stale.
 * That is far inside the collector's own reporting interval, and the client
 * re-renders elapsed time from a local ticker rather than from this timestamp.
 */
export const getLiveDashboards = createPromiseCache(5000, async (userId: string) => {
	const now = new Date()
	const views = await listAccountViews(userId)
	// One shared load per flight, lazy so a user with no reported limits still
	// loads nothing. The event-scan bound covers the widest window any view can
	// need (weekly, plus any longer per-model window); each view filters to its
	// exact windows from there.
	const maxWindowMs = Math.max(
		SEVEN_D_MS,
		...views.flatMap(v => (v.account?.modelLimits ?? []).map(m => windowDurationMs(m.window) ?? SEVEN_D_MS)),
	)
	const earliest = new Date(now.getTime() - maxWindowMs - 5 * 60 * 1000)
	const monthStart = new Date(`${monthKey(now)}-01T00:00:00.000Z`)
	let flight: ReturnType<typeof loadSharedRows> | null = null
	const shared = () => (flight ??= loadSharedRows(userId, earliest, monthStart))
	return Promise.all(views.map(view => loadLiveDashboard(view, now, shared)))
})

/** The account a device's own prompts count against. Devices that have never
 *  reported a login fall back to the first dashboard, which {@link listAccountViews}
 *  guarantees is the account absorbing them. */
export function dashboardForDevice(dashboards: LiveDashboard[], claudeAccountId: string | null): LiveDashboard {
	return dashboards.find(d => d.accountId === claudeAccountId) ?? dashboards[0]
}

/** How many completed windows back the past-windows card looks. */
const PAST_WINDOWS = 8

/** Folded token totals for one (window span × group × model) cell. Model is
 *  carried because a window's official utilization is split across groups by
 *  cost share, and cost is per model. */
export interface WindowAggRow {
	/** Start of the {@link WindowSpan} the cell belongs to, epoch ms. */
	binStart: number
	groupId: string | null
	model: string | null
	totals: TokenTotals & { cacheCreation5mTokens: number; cacheCreation1hTokens: number }
}

/** Same logical-message fold as {@link loadDailyAggregates}, but bucketed into
 *  the given window spans (real recorded windows plus grid fillers — see
 *  {@link windowSpans}) and grouped per group+model. Spans don't overlap, so
 *  the join assigns each message to at most one span. */
async function loadWindowAggregates(view: AccountView, spans: WindowSpan[]): Promise<WindowAggRow[]> {
	if (spans.length === 0) {
		return []
	}
	const { userId } = view
	const since = new Date(Math.min(...spans.map(s => s.start)))
	const until = new Date(Math.max(...spans.map(s => s.end)))
	const spanValues = sql.join(
		spans.map(
			s => sql`(${new Date(s.start).toISOString()}::timestamptz, ${new Date(s.end).toISOString()}::timestamptz)`,
		),
		sql`, `,
	)
	const result = await db.execute(sql`
    WITH folded AS (
      SELECT DISTINCT ON (${FOLD_KEY})
        ${usageEvents.ts} AS ts,
        ${usageEvents.deviceId} AS device_id,
        ${usageEvents.model} AS model,
        ${usageEvents.inputTokens} AS input_tokens,
        ${usageEvents.outputTokens} AS output_tokens,
        ${usageEvents.cacheCreationTokens} AS cache_creation_tokens,
        ${usageEvents.cacheCreation5mTokens} AS cache_creation_5m,
        ${usageEvents.cacheCreation1hTokens} AS cache_creation_1h,
        ${usageEvents.cacheReadTokens} AS cache_read_tokens
      FROM ${usageEvents}
      WHERE ${usageEvents.userId} = ${userId}
        AND ${usageEvents.ts} >= ${since.toISOString()}::timestamptz
        AND ${usageEvents.ts} < ${until.toISOString()}::timestamptz
      ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
    )
    SELECT
      extract(epoch from win.win_start)::bigint AS bin,
      d.group_id AS group_id,
      folded.model AS model,
      sum(folded.input_tokens)::bigint AS input,
      sum(folded.output_tokens)::bigint AS output,
      sum(folded.cache_creation_tokens)::bigint AS cache_creation,
      sum(coalesce(folded.cache_creation_5m, 0))::bigint AS cache_creation_5m,
      sum(coalesce(folded.cache_creation_1h, 0))::bigint AS cache_creation_1h,
      sum(folded.cache_read_tokens)::bigint AS cache_read
    FROM folded
    JOIN ${devices} d ON d.id = folded.device_id
    JOIN (VALUES ${spanValues}) AS win(win_start, win_end)
      ON folded.ts >= win.win_start AND folded.ts < win.win_end
    WHERE ${accountFilterSql(view)}
    GROUP BY 1, 2, 3
    HAVING (
      sum(folded.input_tokens) + sum(folded.output_tokens) +
      sum(folded.cache_creation_tokens) + sum(folded.cache_read_tokens)
    ) > 0
  `)

	const rows = result as unknown as {
		bin: string
		group_id: string | null
		model: string | null
		input: string
		output: string
		cache_creation: string
		cache_creation_5m: string
		cache_creation_1h: string
		cache_read: string
	}[]
	return rows.map(r => {
		const totals = {
			cacheCreation1hTokens: Number(r.cache_creation_1h),
			cacheCreation5mTokens: Number(r.cache_creation_5m),
			cacheCreationTokens: Number(r.cache_creation),
			cacheReadTokens: Number(r.cache_read),
			inputTokens: Number(r.input),
			outputTokens: Number(r.output),
			totalTokens: Number(r.input) + Number(r.output) + Number(r.cache_creation) + Number(r.cache_read),
		}
		return {
			binStart: Number(r.bin) * 1000,
			groupId: r.group_id,
			model: r.model,
			totals,
		}
	})
}

/** One group's slice of a past limit window. */
export interface PastWindowGroup {
	groupId: string | null
	name: string
	color: string
	/** The group's share of the whole account limit, i.e. its cost-weighted cut
	 *  of the utilization Claude reported for the window. Null for windows that
	 *  closed without a recorded utilization sample. */
	accountPct: number | null
	/** Billable tokens (cache reads excluded). */
	tokens: number
}

/** One completed 5h / weekly window with its per-group split. */
export interface PastWindow {
	start: string
	end: string
	/** Billable tokens burned in the window, all groups. */
	tokens: number
	/** Peak account-wide utilization Claude reported while the window was open;
	 *  null when no collector sample covers it. */
	accountPct: number | null
	groups: PastWindowGroup[]
}

export interface WindowHistoryDTO {
	sessions: PastWindow[]
	weeks: PastWindow[]
}

/** Record the utilization Claude reports for the window that is open right now.
 *  Kept at its maximum per window: reports are sampled, so the last one before
 *  a window closes is not necessarily the highest. No-ops without a pct or a
 *  reset instant — the reset is what dates the sample. */
export async function recordLimitSample(
	account: { id: string; userId: string },
	window: LimitWindow,
	pct: number | null | undefined,
	resetsAt: Date | null,
): Promise<void> {
	if (pct == null || !resetsAt) {
		return
	}
	// Snapped to a coarse grid because the reset instant Anthropic reports for one
	// real window jitters by a second or so between reads, and windowStart is part
	// of the primary key: unsnapped, every reading inserts its own row instead of
	// raising the peak on the existing one, which is how one 5h window ended up as
	// a hundred rows that each remember one instant. Coarser than the jitter by
	// orders of magnitude and far finer than a window, so no two real windows can
	// land on the same slot.
	const windowStart = new Date(
		Math.round((resetsAt.getTime() - (window === '5h' ? FIVE_H_MS : SEVEN_D_MS)) / SAMPLE_GRID_MS) * SAMPLE_GRID_MS,
	)
	await db
		.insert(limitSamples)
		.values({ claudeAccountId: account.id, peakPct: pct, userId: account.userId, window, windowStart })
		.onConflictDoUpdate({
			set: {
				peakPct: sql`greatest(${limitSamples.peakPct}, ${pct})`,
				updatedAt: new Date(),
			},
			target: [limitSamples.claudeAccountId, limitSamples.window, limitSamples.windowStart],
		})
}

/** Append a change point when the reported percentage moved since the last one
 *  — the timestamps are what let {@link splitByShare} attribute each rise to
 *  the groups active when it happened. See {@link shouldRecordPoint} for which
 *  readings earn a row; old points are pruned on write, so the table stays
 *  bounded without a job. */
export async function recordLimitChangePoint(
	account: { extId: string | null; id: string; userId: string },
	window: PointWindow,
	pct: number | null | undefined,
	at: Date,
	resetsAt: Date | null,
	// '' is the account-wide series, a model family name its own cap's series.
	model = '',
): Promise<void> {
	// The ext_id = NULL bucket can hold several logins at once (API keys, older
	// collectors). Two of them reporting different utilizations would look like one
	// account sawtoothing, inventing rises to attribute, so those accounts keep the
	// plain cost split — which reads no series shape. Enforced here rather than at
	// the call site so the rule cannot be forgotten by the next caller.
	if (pct == null || account.extId === null) {
		return
	}
	// Compare only against this window's own points, so the first reading after a
	// reset always lands even though it is lower than the previous window's peak.
	const windowStart = windowStartOf(resetsAt, at, windowDurationMs(window) ?? SEVEN_D_MS)
	const [prev] = await db
		.select({ pct: limitChangePoints.pct })
		.from(limitChangePoints)
		.where(
			and(
				eq(limitChangePoints.claudeAccountId, account.id),
				eq(limitChangePoints.window, window),
				eq(limitChangePoints.model, model),
				gte(limitChangePoints.at, windowStart),
			),
		)
		.orderBy(desc(limitChangePoints.at))
		.limit(1)
	if (!shouldRecordPoint(prev, pct)) {
		return
	}
	await db
		.insert(limitChangePoints)
		.values({ at, claudeAccountId: account.id, model, pct, userId: account.userId, window })
		.onConflictDoNothing()
	// Nothing reads past the longest window (7d) plus a day of clamp slack. Not
	// scoped to this series: every series ages out on the same bound, so whichever
	// one recorded a point cleans up after all of them.
	await db
		.delete(limitChangePoints)
		.where(
			and(
				eq(limitChangePoints.claudeAccountId, account.id),
				lt(limitChangePoints.at, new Date(at.getTime() - SEVEN_D_MS - 24 * HOUR_MS)),
			),
		)
}

/** How long a fit stands before the next limits report refits it. The inputs
 *  only change as fast as the account is used; a day keeps the fit current
 *  without making a heavy query part of anything a user waits on. */
const CALIBRATION_TTL_MS = 24 * HOUR_MS

/** Accounts whose refit has already been attempted, and when. Failure has to be
 *  remembered as well as success: a fleet whose rises come from machines outside
 *  it never produces a calibration, and without this it would re-run the fit on
 *  every reading forever. In-process like the rest of this app's caches (see
 *  AGENTS.md) — a restart costs one extra fit per account. */
const calibrationAttempts = new Map<string, number>()

/**
 * Refit what this account's own history says about how Anthropic meters it.
 *
 * Runs off the back of a limits report rather than a scheduler: reports arrive
 * every minute from every device, so "has a day passed" is all the scheduling
 * this needs. Callers do not await it — a stale calibration is not worth
 * delaying an ingest for.
 *
 * Only ever narrows to devices actually stamped with this account: the fit is
 * about which usage moved *this* meter, and unstamped devices may be signed
 * into a different subscription.
 */
export async function recalibrateAccount(
	account: { calibration: Calibration | null; extId: string | null; id: string; userId: string },
	now = new Date(),
): Promise<void> {
	// Unidentified accounts get no change points, so there is nothing to fit from.
	if (account.extId === null) {
		return
	}
	const last = Math.max(calibrationAttempts.get(account.id) ?? 0, Date.parse(account.calibration?.at ?? '') || 0)
	if (now.getTime() - last < CALIBRATION_TTL_MS) {
		return
	}
	calibrationAttempts.set(account.id, now.getTime())
	// The whole retained series. Change points are pruned to the longest window
	// plus slack, so this is every rise the account still remembers.
	const cutoff = new Date(now.getTime() - SEVEN_D_MS - 24 * HOUR_MS)
	const [settings, points, events] = await Promise.all([
		ensureSettings(account.userId),
		db
			.select({ at: limitChangePoints.at, pct: limitChangePoints.pct })
			.from(limitChangePoints)
			.where(
				and(
					eq(limitChangePoints.claudeAccountId, account.id),
					// The 5h series only: it moves fastest, so it carries by far the most
					// rises, and the meter it tracks is the same one behind every window.
					eq(limitChangePoints.window, '5h'),
					eq(limitChangePoints.model, ''),
					gte(limitChangePoints.at, cutoff),
				),
			)
			.orderBy(asc(limitChangePoints.at)),
		loadRecentEvents(account.userId, cutoff, account.id),
	])
	const ttl: CacheTtl = settings?.cacheWriteTtl === '1h' ? '1h' : '5m'
	// Null on a failed fit is a result, not an error: it clears a calibration that
	// used to hold and no longer does.
	const fit = fitCalibration(points, foldEvents(events), ttl, now)
	await db.update(claudeAccounts).set({ calibration: fit }).where(eq(claudeAccounts.id, account.id))
}

/** Every recorded utilization sample for one account+window at or after
 *  `since`, raw — {@link windowSpans} turns them into real window boundaries. */
async function loadWindowSamples(
	accountId: string | null,
	window: LimitWindow,
	since: Date,
): Promise<{ start: number; pct: number }[]> {
	// No account row yet means nothing has ever been sampled.
	if (accountId === null) {
		return []
	}
	const rows = await db
		.select({
			peakPct: limitSamples.peakPct,
			windowStart: limitSamples.windowStart,
		})
		.from(limitSamples)
		.where(
			and(
				eq(limitSamples.claudeAccountId, accountId),
				eq(limitSamples.window, window),
				gte(limitSamples.windowStart, since),
			),
		)
	return rows.map(r => ({ pct: r.peakPct, start: new Date(r.windowStart).getTime() }))
}

/** Fold span-bucketed rows into per-window group splits, newest window first.
 *  The window's recorded utilization is split across groups by cost share, so
 *  the group cells sum to the window's account-wide percentage. Windows with no
 *  activity are dropped; windows with activity but no recorded utilization show
 *  tokens only (accountPct null). */
export function buildPastWindows(
	rows: WindowAggRow[],
	spans: WindowSpan[],
	ttl: CacheTtl,
	label: (id: string | null) => { name: string; color: string },
): PastWindow[] {
	const byBin = new Map<number, WindowAggRow[]>()
	for (const row of rows) {
		const bin = byBin.get(row.binStart)
		if (bin) {
			bin.push(row)
		} else {
			byBin.set(row.binStart, [row])
		}
	}

	return spans
		.map(spanOf => {
			const cells = byBin.get(spanOf.start) ?? []
			const accountPct = spanOf.pct
			const byGroup = new Map<string | null, { tokens: number; cost: number }>()
			let totalCost = 0
			for (const c of cells) {
				const cur = byGroup.get(c.groupId) ?? { cost: 0, tokens: 0 }
				const cost = costForTokens(c.totals, c.model, ttl)
				cur.tokens += billableTokens(c.totals)
				cur.cost += cost
				totalCost += cost
				byGroup.set(c.groupId, cur)
			}
			return {
				// Samples carry decimals; display rounds once, here at the end.
				accountPct: accountPct === null ? null : Math.round(accountPct),
				end: new Date(spanOf.end).toISOString(),
				groups: [...byGroup.entries()]
					.map(([groupId, g]) => ({
						groupId,
						...label(groupId),
						accountPct:
							accountPct === null || totalCost === 0
								? null
								: Math.round(accountPct * (g.cost / totalCost)),
						tokens: g.tokens,
					}))
					.toSorted((a, b) => b.tokens - a.tokens),
				start: new Date(spanOf.start).toISOString(),
				tokens: [...byGroup.values()].reduce((sum, g) => sum + g.tokens, 0),
			}
		})
		.filter(w => w.groups.length > 0)
}

/** The last {@link PAST_WINDOWS} completed 5h and weekly windows, split per
 *  group — the "how did we do last session/week" counterpart to the live card.
 *  Window boundaries come from the recorded utilization samples (Anthropic's
 *  windows are not on a fixed grid — see {@link windowSpans}); only time no
 *  sample covers falls back to a grid guess. */
export async function getWindowHistory(view: AccountView, now: Date): Promise<WindowHistoryDTO> {
	const { userId } = view
	const settings = await ensureSettings(userId)
	// Grid fillers are anchored on the reported reset instants so they match the
	// current reset phase; without a report, fall back to "now" / the configured
	// week start.
	const fiveOrigin = view.account?.fiveHourResetsAt ? new Date(view.account.fiveHourResetsAt) : now
	const weekOrigin = view.account?.sevenDayResetsAt
		? new Date(view.account.sevenDayResetsAt)
		: weekWindowStart(now, settings.weekResetWeekday, settings.weekResetHourUtc)
	// Reach a little past the shown count: sampled windows can sit sparser than
	// the grid stride when the account idled between sessions.
	const sessionSince = new Date(now.getTime() - (PAST_WINDOWS + 2) * FIVE_H_MS)
	const weekSince = new Date(now.getTime() - (PAST_WINDOWS + 2) * SEVEN_D_MS)

	const [sessionSamples, weekSamples] = await Promise.all([
		loadWindowSamples(view.account?.id ?? null, '5h', sessionSince),
		loadWindowSamples(view.account?.id ?? null, '7d', weekSince),
	])
	const sessionSpans = windowSpans(sessionSamples, FIVE_H_MS, fiveOrigin, now, PAST_WINDOWS)
	const weekSpans = windowSpans(weekSamples, SEVEN_D_MS, weekOrigin, now, PAST_WINDOWS)

	await refreshPrices()
	const [groupRows, sessionRows, weekRows] = await Promise.all([
		db.select().from(groups).where(eq(groups.ownerId, userId)),
		loadWindowAggregates(view, sessionSpans),
		loadWindowAggregates(view, weekSpans),
	])
	const label = (id: string | null) => {
		const g = id === null ? undefined : groupRows.find(x => x.id === id)
		return {
			color: g?.color ?? '#94a3b8',
			name: id === null ? 'Ungrouped' : (g?.name ?? 'Unknown'),
		}
	}

	const ttl: CacheTtl = settings.cacheWriteTtl === '1h' ? '1h' : '5m'
	return {
		sessions: buildPastWindows(sessionRows, sessionSpans, ttl, label),
		weeks: buildPastWindows(weekRows, weekSpans, ttl, label),
	}
}

/** One (UTC day × group × model × source × device) aggregate with its cost —
 *  the raw all-time series the dashboard explorer filters and charts. */
export interface HistoryRow extends DailyAggRow {
	costUsd: number
}

/** All-time history plus the labels the client needs to name its dimensions. */
export interface HistoryDTO {
	rows: HistoryRow[]
	groups: { id: string; name: string; color: string }[]
	// Revoked devices keep their history, so the explorer still lists them — and
	// says so, since two machines can share a name across a re-enrol.
	devices: { id: string; name: string; groupId: string | null; revoked: boolean }[]
}

/**
 * The all-time aggregate scan, cached per user for a minute.
 *
 * This is the one unbounded scan left (see `loadDailyAggregates`) and it runs in
 * the dashboard loader, which `AutoRefresh` invalidates every 60s per open tab —
 * so uncached, N tabs recompute the account's whole history N times a minute to
 * render a chart that moves daily.
 *
 * Only the scan is cached, never the whole `HistoryDTO`: that also carries group
 * and device names, which mutations change and then expect to see immediately
 * via `router.invalidate()`. Caching those would show a renamed group under its
 * old name, and hide a newly added device, for up to a minute.
 */
const cachedDailyRows = createPromiseCache(60_000, (userId: string) => loadDailyAggregates(userId))

export async function getHistory(userId: string): Promise<HistoryDTO> {
	await refreshPrices()
	const [settings, rows, groupRows, deviceRows] = await Promise.all([
		ensureSettings(userId),
		cachedDailyRows(userId),
		db.select().from(groups).where(eq(groups.ownerId, userId)),
		db
			.select({ groupId: devices.groupId, id: devices.id, name: devices.name, revoked: devices.revoked })
			.from(devices)
			.where(eq(devices.userId, userId)),
	])
	const ttl: CacheTtl = settings.cacheWriteTtl === '1h' ? '1h' : '5m'
	return {
		devices: deviceRows,
		groups: groupRows.map(g => ({ color: g.color, id: g.id, name: g.name })),
		rows: rows.map(r => ({ ...r, costUsd: costForTokens(r, r.model, ttl) })),
	}
}

/** One project's usage over the {@link PROJECT_DAYS} window. The "project" is
 *  the working directory Claude Code recorded on the message, since that is the
 *  only project identity the JSONL logs carry. */
export interface ProjectUsage {
	/** Absolute cwd as reported, or null when the log had none. */
	path: string | null
	/** Groups whose devices produced this usage, costliest first — a checkout
	 *  cloned on two machines shows up under both. */
	groups: { name: string; color: string }[]
	billableTokens: number
	totalTokens: number
	costUsd: number
	/** Newest event in the window, ISO. */
	lastActive: string
}

/**
 * Per-project token totals and cost for the last {@link PROJECT_DAYS} days,
 * costliest first.
 *
 * Same in-SQL fold as {@link loadDailyAggregates} (streamed segments collapse to
 * the largest row per logical message), grouped by (cwd × model × group) because
 * pricing is per model; the models are then summed away per project here, the
 * groups only ranked.
 */
export async function getProjectUsage(userId: string, now = new Date()): Promise<ProjectUsage[]> {
	const since = new Date(now.getTime() - PROJECT_DAYS * 24 * 60 * 60 * 1000)
	await refreshPrices()
	const [settings, groupRows] = await Promise.all([
		ensureSettings(userId),
		db.select().from(groups).where(eq(groups.ownerId, userId)),
	])
	const result = await db.execute(sql`
    WITH folded AS (
      SELECT DISTINCT ON (${FOLD_KEY})
        ${usageEvents.ts} AS ts,
        ${usageEvents.cwd} AS cwd,
        d.group_id AS group_id,
        ${usageEvents.model} AS model,
        ${usageEvents.inputTokens} AS input_tokens,
        ${usageEvents.outputTokens} AS output_tokens,
        ${usageEvents.cacheCreationTokens} AS cache_creation_tokens,
        ${usageEvents.cacheCreation5mTokens} AS cache_creation_5m,
        ${usageEvents.cacheCreation1hTokens} AS cache_creation_1h,
        ${usageEvents.cacheReadTokens} AS cache_read_tokens
      FROM ${usageEvents}
      JOIN ${devices} d ON d.id = ${usageEvents.deviceId}
      WHERE ${usageEvents.userId} = ${userId}
        AND ${usageEvents.ts} >= ${since.toISOString()}::timestamptz
      ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
    )
    SELECT
      folded.cwd AS cwd,
      folded.group_id AS group_id,
      folded.model AS model,
      max(folded.ts) AS last_ts,
      sum(folded.input_tokens)::bigint AS input,
      sum(folded.output_tokens)::bigint AS output,
      sum(folded.cache_creation_tokens)::bigint AS cache_creation,
      sum(coalesce(folded.cache_creation_5m, 0))::bigint AS cache_creation_5m,
      sum(coalesce(folded.cache_creation_1h, 0))::bigint AS cache_creation_1h,
      sum(folded.cache_read_tokens)::bigint AS cache_read
    FROM folded
    GROUP BY 1, 2, 3
    HAVING (
      sum(folded.input_tokens) + sum(folded.output_tokens) +
      sum(folded.cache_creation_tokens) + sum(folded.cache_read_tokens)
    ) > 0
  `)

	const rows = result as unknown as {
		cwd: string | null
		group_id: string | null
		model: string | null
		last_ts: string | Date
		input: string
		output: string
		cache_creation: string
		cache_creation_5m: string
		cache_creation_1h: string
		cache_read: string
	}[]
	const ttl: CacheTtl = settings.cacheWriteTtl === '1h' ? '1h' : '5m'
	const byPath = new Map<string, ProjectUsage>()
	// Cost per (project × group), so the dots can be ranked by who spent most.
	const groupCost = new Map<string, Map<string | null, number>>()
	for (const r of rows) {
		const totals = {
			cacheCreation1hTokens: Number(r.cache_creation_1h),
			cacheCreation5mTokens: Number(r.cache_creation_5m),
			cacheCreationTokens: Number(r.cache_creation),
			cacheReadTokens: Number(r.cache_read),
			inputTokens: Number(r.input),
			outputTokens: Number(r.output),
			totalTokens: Number(r.input) + Number(r.output) + Number(r.cache_creation) + Number(r.cache_read),
		}
		const lastActive = new Date(r.last_ts).toISOString()
		const key = r.cwd ?? ''
		const cost = costForTokens(totals, r.model, ttl)
		const cur = byPath.get(key)
		if (cur) {
			cur.billableTokens += billableTokens(totals)
			cur.totalTokens += totals.totalTokens
			cur.costUsd += cost
			cur.lastActive = lastActive > cur.lastActive ? lastActive : cur.lastActive
		} else {
			byPath.set(key, {
				billableTokens: billableTokens(totals),
				costUsd: cost,
				groups: [],
				lastActive,
				path: r.cwd,
				totalTokens: totals.totalTokens,
			})
		}
		const byGroup = groupCost.get(key) ?? new Map<string | null, number>()
		byGroup.set(r.group_id, (byGroup.get(r.group_id) ?? 0) + cost)
		groupCost.set(key, byGroup)
	}
	for (const [key, project] of byPath) {
		project.groups = [...(groupCost.get(key) ?? [])]
			.toSorted((a, b) => b[1] - a[1])
			.map(([id]) => {
				const g = id === null ? undefined : groupRows.find(x => x.id === id)
				return { color: g?.color ?? '#94a3b8', name: id === null ? 'Ungrouped' : (g?.name ?? 'Unknown') }
			})
	}
	return [...byPath.values()].toSorted((a, b) => b.costUsd - a.costUsd)
}

/** DTO form of a per-model limit (resetsAt → ISO). */
export interface ModelLimitDTO extends Omit<LiveModelLimit, 'resetsAt'> {
	resetsAt: string | null
}

/** JSON-serializable form of LiveDashboard (Dates → ISO) for the client poll. */
export interface DashboardDTO {
	accountId: string | null
	accountLabel: string | null
	connected: boolean
	source: 'sub' | 'api' | null
	reportedAt: string | null
	fiveHourPct: number
	sevenDayPct: number
	fiveHourResetsAt: string | null
	sevenDayResetsAt: string | null
	groups: LiveGroupUsage[]
	modelLimits: ModelLimitDTO[]
	spend: Spend
}

export function toDashboardDTO(d: LiveDashboard): DashboardDTO {
	return {
		accountId: d.accountId,
		accountLabel: d.accountLabel,
		connected: d.connected,
		fiveHourPct: d.fiveHourPct,
		fiveHourResetsAt: d.fiveHourResetsAt?.toISOString() ?? null,
		groups: d.groups,
		modelLimits: d.modelLimits.map(m => ({
			...m,
			resetsAt: m.resetsAt?.toISOString() ?? null,
		})),
		reportedAt: d.reportedAt?.toISOString() ?? null,
		sevenDayPct: d.sevenDayPct,
		sevenDayResetsAt: d.sevenDayResetsAt?.toISOString() ?? null,
		source: d.source,
		spend: d.spend,
	}
}

/** The user's "default" group — the oldest one, or a freshly created "Default"
 *  if the user has none. Used so a device is never left without a group. */
export async function ensureDefaultGroup(userId: string) {
	const existing = await db
		.select()
		.from(groups)
		.where(eq(groups.ownerId, userId))
		.orderBy(asc(groups.createdAt))
		.limit(1)
	if (existing[0]) {
		return existing[0]
	}
	const inserted = await db
		.insert(groups)
		.values({
			color: '#6366f1',
			id: randomUUID(),
			name: 'Default',
			ownerId: userId,
		})
		.returning()
	return inserted[0]
}

/** Move any of the user's devices that have no group into the default group.
 *  Idempotent and cheap (a no-op once every device is grouped); enforces the
 *  "no ungrouped devices" invariant for legacy rows. */
export async function backfillUngroupedDevices(userId: string): Promise<void> {
	const orphan = await db
		.select({ id: devices.id })
		.from(devices)
		.where(and(eq(devices.userId, userId), isNull(devices.groupId)))
		.limit(1)
	if (!orphan[0]) {
		return
	} // common case — nothing ungrouped, don't create a group
	const def = await ensureDefaultGroup(userId)
	await db
		.update(devices)
		.set({ groupId: def.id })
		.where(and(eq(devices.userId, userId), isNull(devices.groupId)))
}

export async function listGroups(userId: string) {
	const counts = await db
		.select({
			count: sql<number>`count(*)::int`,
			groupId: devices.groupId,
		})
		.from(devices)
		.where(eq(devices.userId, userId))
		.groupBy(devices.groupId)
	const countMap = new Map(counts.map(c => [c.groupId, c.count]))
	const rows = await db.select().from(groups).where(eq(groups.ownerId, userId)).orderBy(desc(groups.createdAt))
	return rows.map(g => ({ ...g, deviceCount: countMap.get(g.id) ?? 0 }))
}

export async function listDevices(userId: string) {
	return (
		db
			.select({
				blockingEnabled: devices.blockingEnabled,
				collectorVersion: devices.collectorVersion,
				createdAt: devices.createdAt,
				groupId: devices.groupId,
				groupName: groups.name,
				hostname: devices.hostname,
				id: devices.id,
				lastSeenAt: devices.lastSeenAt,
				name: devices.name,
				os: devices.os,
				revoked: devices.revoked,
				tokenPrefix: devices.tokenPrefix,
			})
			.from(devices)
			// Owner-scoped join so a stray cross-tenant groupId can never leak a name.
			.leftJoin(groups, and(eq(devices.groupId, groups.id), eq(groups.ownerId, userId)))
			.where(eq(devices.userId, userId))
			.orderBy(desc(devices.createdAt))
	)
}
