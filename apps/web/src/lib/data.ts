import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '@/db'
import { claudeAccounts, devices, groups, limitSamples, usageEvents, userSettings } from '@/db/schema'
import type { ClaudeAccount as ClaudeAccountRow, LimitWindow, StoredModelLimit } from '@/db/schema'
import { createPromiseCache } from '@/lib/promise-cache'
import {
	billableTokens,
	costForTokens,
	costUsd,
	EMPTY_TOTALS,
	filterByWindow,
	foldEvents,
	modelBreakdown,
	modelLabel,
	monthKey,
	pastWindowStarts,
	PROJECT_DAYS,
	refreshPrices,
	sumTokens,
	weekWindowStart,
} from '@/lib/usage'
import type { CacheTtl, DailyAggRow, ModelUsage, TokenTotals, UsageRecord } from '@/lib/usage'

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
 * Callers still fold. That is not redundant bookkeeping: `splitByShare` is an
 * exported pure function with its own tests over unfolded input, and "never SUM
 * raw rows" is the one invariant that silently produces wrong numbers rather
 * than an error. `foldEvents` is idempotent and the input here is already small,
 * so the guarantee costs a Map pass — worth keeping on this path.
 */
export async function loadRecentEvents(userId: string, cutoff: Date): Promise<UsageRecord[]> {
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
      ${usageEvents.cacheReadTokens} AS cache_read_tokens
    FROM ${usageEvents}
    JOIN ${devices} d ON d.id = ${usageEvents.deviceId}
    WHERE ${usageEvents.userId} = ${userId}
      AND ${usageEvents.ts} >= ${cutoff.toISOString()}::timestamptz
    ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
  `)

	const rows = result as unknown as {
		uuid: string
		message_id: string | null
		request_id: string | null
		model: string | null
		source: string | null
		// A raw db.execute bypasses drizzle's column decoding, so postgres-js hands
		// timestamptz back as its wire text ('2026-06-18 12:00:00+00') rather than a
		// Date. Declaring it Date here would typecheck and then blow up at the first
		// `e.ts.getTime()` in splitByShare, on every dashboard load.
		ts: string
		device_id: string | null
		group_id: string | null
		input_tokens: number
		output_tokens: number
		cache_creation_tokens: number
		cache_read_tokens: number
	}[]
	// int4 really does arrive as a JS number, so only `ts` needs converting.
	return rows.map(r => ({
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
		cache_read: string
	}[]
	return rows.map(r => ({
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

/** Split an official account-wide percentage across an arbitrary key (group or
 *  device) by each key's share of estimated cost (API list prices) within the
 *  window — weights buckets (output 5×, cache write 1.25×, cache read 0.1×) and
 *  models (Fable > Opus > Sonnet > Haiku) like Anthropic's cost-based limit
 *  accounting. Token fields stay billable/total for display. */
interface ShareEntry {
	/** This key's share of the official pct, unrounded — scaled to a budget pct
	 *  before display, so rounding happens once, at the end. */
	exactPct: number
	tokens: number
	/** All-bucket total (incl. cache_read); display only, never used for splits. */
	totalTokens: number
	models: ModelUsage[]
}

export function splitByShare(
	events: UsageRecord[],
	windowStart: Date,
	now: Date,
	officialPct: number,
	ttl: CacheTtl,
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
	let totalCost = 0
	for (const [k, evs] of byKey) {
		const folded = foldEvents(evs)
		const totals = sumTokens(folded)
		tokensByKey.set(k, billableTokens(totals))
		totalByKey.set(k, totals.totalTokens)
		const cost = folded.reduce((s, e) => s + costUsd(e, ttl), 0)
		costByKey.set(k, cost)
		// `folded`, not `evs`: modelBreakdown folds internally anyway, so handing it
		// the raw list just refolds what the line above already did.
		modelsByKey.set(k, modelBreakdown(folded))
		totalCost += cost
	}
	const models = (k: string | null) => modelsByKey.get(k) ?? []
	const out = new Map<string | null, ShareEntry>()

	const target = Math.max(0, officialPct)
	for (const [k, tok] of tokensByKey) {
		out.set(k, {
			exactPct: totalCost > 0 ? target * ((costByKey.get(k) ?? 0) / totalCost) : 0,
			models: models(k),
			tokens: tok,
			totalTokens: totalByKey.get(k) ?? 0,
		})
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
async function loadLiveDashboard(view: AccountView, now: Date): Promise<LiveDashboard> {
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

	// Clamp each window to exactly its nominal duration ending at `now`, so a
	// stale resets_at can never widen the split window beyond 5h / 7d.
	const fiveStart = new Date(
		Math.max(
			(base.fiveHourResetsAt ?? new Date(now.getTime() - FIVE_H_MS)).getTime() - FIVE_H_MS,
			now.getTime() - FIVE_H_MS,
		),
	)
	const weekStart = new Date(
		Math.max(
			(base.sevenDayResetsAt ?? new Date(now.getTime() - SEVEN_D_MS)).getTime() - SEVEN_D_MS,
			now.getTime() - SEVEN_D_MS,
		),
	)

	// Per-model limit windows (e.g. Fable weekly), clamped the same way. Entries
	// with no reported pct can't be split — drop them up front.
	const modelWindows = (acct.modelLimits ?? [])
		.filter((m): m is StoredModelLimit & { pct: number } => m.pct != null)
		.map(m => {
			const dur = windowDurationMs(m.window) ?? SEVEN_D_MS
			const parsed = m.resetsAt ? new Date(m.resetsAt) : null
			const resetsAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
			const start = new Date(
				Math.max((resetsAt ?? new Date(now.getTime() - dur)).getTime() - dur, now.getTime() - dur),
			)
			return { entry: m, resetsAt, start }
		})

	// Load only what the windows need (covers a future reset too), not a fixed 8d.
	const earliest = new Date(
		Math.min(weekStart.getTime(), fiveStart.getTime(), ...modelWindows.map(w => w.start.getTime())) - 5 * 60 * 1000,
	)
	// Events, the group list and the daily aggregates are independent — one
	// round-trip. This is a per-request path (5s dashboard poll, plus the
	// collector guard on every prompt), and the only thing it takes from the
	// aggregates is the current month, so the scan is bounded to that month
	// rather than the whole history. Both sides bucket in UTC, so the bound is
	// exact.
	//
	// refreshPrices rides along because it has to finish BEFORE splitByShare: that
	// split is cost-weighted, so pricing every event off the fallback tiers would
	// hand the first dashboard of a cold process a different answer than the next
	// poll gives. It is a no-op after the first call.
	const monthStart = new Date(`${monthKey(now)}-01T00:00:00.000Z`)
	const [allEvents, groupRows, allAggRows, deviceRows] = await Promise.all([
		loadRecentEvents(userId, earliest),
		db.select().from(groups).where(eq(groups.ownerId, userId)),
		loadDailyAggregates(userId, monthStart),
		db
			.select({ claudeAccountId: devices.claudeAccountId, groupId: devices.groupId, id: devices.id })
			.from(devices)
			.where(eq(devices.userId, userId)),
		refreshPrices(),
	])

	// Usage belongs to the account its device is signed into *now*, the same way
	// it already follows a device between groups.
	const myDevices = deviceRows.filter(d => inAccount(view, d.claudeAccountId))
	const mine = new Set(myDevices.map(d => d.id))
	// Both loaders inner-join devices, so a null deviceId here is only a typing
	// artifact of the join.
	const events = allEvents.filter(e => e.deviceId != null && mine.has(e.deviceId))
	const aggRows = allAggRows.filter(r => r.deviceId !== null && mine.has(r.deviceId))

	// Every group with a device on this account claims an equal slice of that
	// account's limit — a group that never touches this subscription can't spend
	// its budget. The "Ungrouped" row is divided by that same count without being
	// counted in it, so when loose devices exist the displayed slices deliberately
	// over-allocate rather than shrink every real group to make room for them.
	const budgetShares = Math.max(1, new Set(myDevices.map(d => d.groupId).filter(g => g !== null)).size)
	const ttl: CacheTtl = settings.cacheWriteTtl === '1h' ? '1h' : '5m'
	const sessionSplit = splitByShare(events, fiveStart, now, base.fiveHourPct, ttl)
	const weeklySplit = splitByShare(events, weekStart, now, base.sevenDayPct, ttl)

	const keys = new Set<string | null>([...sessionSplit.keys(), ...weeklySplit.keys()])
	const nameFor = (id: string | null) =>
		id === null ? 'Ungrouped' : (groupRows.find(g => g.id === id)?.name ?? 'Unknown')
	const colorFor = (id: string | null) =>
		id === null ? '#94a3b8' : (groupRows.find(g => g.id === id)?.color ?? '#94a3b8')

	const groupUsages: LiveGroupUsage[] = [...keys].map(id => ({
		groupId: id,
		name: nameFor(id),
		color: colorFor(id),
		// Usage against the group's equal slice of the account limit: a group
		// filling its share reads 100% while the account is at 50%.
		sessionBudgetPct: groupBudgetPct(sessionSplit.get(id), budgetShares),
		weeklyBudgetPct: groupBudgetPct(weeklySplit.get(id), budgetShares),
		sessionTokens: sessionSplit.get(id)?.tokens ?? 0,
		weeklyTokens: weeklySplit.get(id)?.tokens ?? 0,
		sessionTotalTokens: sessionSplit.get(id)?.totalTokens ?? 0,
		weeklyTotalTokens: weeklySplit.get(id)?.totalTokens ?? 0,
		// Model breakdowns per window (each matches that window's token figure).
		sessionModels: sessionSplit.get(id)?.models ?? [],
		models: weeklySplit.get(id)?.models ?? [],
	}))
	groupUsages.sort((a, b) => b.weeklyTokens - a.weeklyTokens)

	// Per-model official limits: split each model cap across groups by that model
	// family's local cost share within the limit's own window — the same cost
	// split (and per-group budget scaling) as the session/weekly limits above.
	const modelLimits: LiveModelLimit[] = modelWindows.map(({ entry, start, resetsAt }) => {
		const familyEvents = events.filter(e => (e.model ?? '').toLowerCase().includes(entry.model))
		const split = splitByShare(familyEvents, start, now, entry.pct, ttl)
		const groupRowsFor: LiveModelLimitGroup[] = [...split.entries()].map(([id, s]) => ({
			budgetPct: groupBudgetPct(s, budgetShares),
			color: colorFor(id),
			groupId: id,
			name: nameFor(id),
			tokens: s.tokens,
		}))
		groupRowsFor.sort((a, b) => b.tokens - a.tokens)
		return {
			groups: groupRowsFor,
			label: modelLabel(entry.model),
			model: entry.model,
			pct: Math.min(100, Math.max(0, entry.pct)),
			resetsAt,
			window: entry.window,
		}
	})

	// Weekly-window spend: fold once, then price each logical message by its own
	// model. Monthly spend comes from the pre-folded daily aggregates, priced per
	// (day × group × model) cell the same way.
	const weeklyFolded = foldEvents(filterByWindow(events, weekStart, now))
	const monthK = monthKey(now)
	// Redundant while aggRows is loaded with the matching `since` bound above, and
	// kept so this stays correct if that bound is ever widened.
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
	return Promise.all(views.map(view => loadLiveDashboard(view, now)))
})

/** The account a device's own prompts count against. Devices that have never
 *  reported a login fall back to the first dashboard, which {@link listAccountViews}
 *  guarantees is the account absorbing them. */
export function dashboardForDevice(dashboards: LiveDashboard[], claudeAccountId: string | null): LiveDashboard {
	return dashboards.find(d => d.accountId === claudeAccountId) ?? dashboards[0]
}

/** How many completed windows back the past-windows card looks. */
const PAST_WINDOWS = 8

/** Folded token totals for one (window bucket × group × model) cell. Model is
 *  carried because a window's official utilization is split across groups by
 *  cost share, and cost is per model. */
export interface WindowAggRow {
	/** Bucket start, epoch ms, aligned to the limit's own reset boundary. */
	binStart: number
	groupId: string | null
	model: string | null
	totals: TokenTotals
}

/** Same logical-message fold as {@link loadDailyAggregates}, but bucketed into
 *  rolling `strideMs` windows aligned to `origin` and grouped per group+model. */
async function loadWindowAggregates(
	view: AccountView,
	strideMs: number,
	origin: Date,
	since: Date,
	until: Date,
): Promise<WindowAggRow[]> {
	const { userId } = view
	const bucket = sql`date_bin(make_interval(secs => ${strideMs / 1000}::float8), folded.ts, ${origin.toISOString()}::timestamptz)`
	const result = await db.execute(sql`
    WITH folded AS (
      SELECT DISTINCT ON (${FOLD_KEY})
        ${usageEvents.ts} AS ts,
        ${usageEvents.deviceId} AS device_id,
        ${usageEvents.model} AS model,
        ${usageEvents.inputTokens} AS input_tokens,
        ${usageEvents.outputTokens} AS output_tokens,
        ${usageEvents.cacheCreationTokens} AS cache_creation_tokens,
        ${usageEvents.cacheReadTokens} AS cache_read_tokens
      FROM ${usageEvents}
      WHERE ${usageEvents.userId} = ${userId}
        AND ${usageEvents.ts} >= ${since.toISOString()}::timestamptz
        AND ${usageEvents.ts} < ${until.toISOString()}::timestamptz
      ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
    )
    SELECT
      extract(epoch from ${bucket})::bigint AS bin,
      d.group_id AS group_id,
      folded.model AS model,
      sum(folded.input_tokens)::bigint AS input,
      sum(folded.output_tokens)::bigint AS output,
      sum(folded.cache_creation_tokens)::bigint AS cache_creation,
      sum(folded.cache_read_tokens)::bigint AS cache_read
    FROM folded
    JOIN ${devices} d ON d.id = folded.device_id
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
		cache_read: string
	}[]
	return rows.map(r => {
		const totals = {
			cacheCreationTokens: Number(r.cache_creation),
			cacheReadTokens: Number(r.cache_read),
			inputTokens: Number(r.input),
			outputTokens: Number(r.output),
			totalTokens: Number(r.input) + Number(r.output) + Number(r.cache_creation) + Number(r.cache_read),
		} satisfies TokenTotals
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

/** Start of the `strideMs` bucket holding `t`, aligned to `origin` — the JS
 *  twin of the SQL `date_bin` the window aggregates are bucketed with, so a
 *  utilization sample lands in the same bucket as the tokens it measured. */
const binStartOf = (t: number, origin: number, strideMs: number) =>
	origin + Math.floor((t - origin) / strideMs) * strideMs

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
	const windowStart = new Date(resetsAt.getTime() - (window === '5h' ? FIVE_H_MS : SEVEN_D_MS))
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

/** Recorded peak utilization per window bucket, for windows starting at or
 *  after `since`. Samples are bucketed like the token aggregates; a window
 *  whose real boundaries drifted from the current reset phase lands in the
 *  bucket its start falls into, and the highest sample there wins. */
async function loadWindowPeaks(
	accountId: string | null,
	window: LimitWindow,
	strideMs: number,
	origin: Date,
	since: Date,
): Promise<Map<number, number>> {
	// No account row yet means nothing has ever been sampled.
	if (accountId === null) {
		return new Map()
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
	const byBin = new Map<number, number>()
	for (const r of rows) {
		const bin = binStartOf(new Date(r.windowStart).getTime(), origin.getTime(), strideMs)
		byBin.set(bin, Math.max(byBin.get(bin) ?? 0, r.peakPct))
	}
	return byBin
}

/** Fold bucketed rows into per-window group splits, newest window first. The
 *  window's recorded utilization is split across groups by cost share, so the
 *  group cells sum to the window's account-wide percentage. Windows with no
 *  activity are dropped; windows with activity but no recorded utilization show
 *  tokens only (accountPct null). */
export function buildPastWindows(
	rows: WindowAggRow[],
	starts: Date[],
	strideMs: number,
	peakPctByBin: Map<number, number>,
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

	return starts
		.map(start => {
			const cells = byBin.get(start.getTime()) ?? []
			const accountPct = peakPctByBin.get(start.getTime()) ?? null
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
				accountPct,
				end: new Date(start.getTime() + strideMs).toISOString(),
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
				start: start.toISOString(),
				tokens: [...byGroup.values()].reduce((sum, g) => sum + g.tokens, 0),
			}
		})
		.filter(w => w.groups.length > 0)
}

/** The last {@link PAST_WINDOWS} completed 5h and weekly windows, split per
 *  group — the "how did we do last session/week" counterpart to the live card. */
export async function getWindowHistory(view: AccountView, now: Date): Promise<WindowHistoryDTO> {
	const { userId } = view
	const settings = await ensureSettings(userId)
	// Anchor the buckets on the reported reset instants so they match the real
	// windows; without a report, fall back to "now" / the configured week start.
	const fiveOrigin = view.account?.fiveHourResetsAt ? new Date(view.account.fiveHourResetsAt) : now
	const weekOrigin = view.account?.sevenDayResetsAt
		? new Date(view.account.sevenDayResetsAt)
		: weekWindowStart(now, settings.weekResetWeekday, settings.weekResetHourUtc)
	const sessionStarts = pastWindowStarts(fiveOrigin, FIVE_H_MS, now, PAST_WINDOWS)
	const weekStarts = pastWindowStarts(weekOrigin, SEVEN_D_MS, now, PAST_WINDOWS)
	// Only completed windows are shown, so nothing past the newest one's end is
	// needed.
	const span = (starts: Date[], strideMs: number) => ({
		since: starts.at(-1) ?? now,
		until: new Date((starts[0]?.getTime() ?? now.getTime()) + strideMs),
	})
	const sessionSpan = span(sessionStarts, FIVE_H_MS)
	const weekSpan = span(weekStarts, SEVEN_D_MS)

	await refreshPrices()
	const [groupRows, sessionRows, weekRows, sessionPeaks, weekPeaks] = await Promise.all([
		db.select().from(groups).where(eq(groups.ownerId, userId)),
		loadWindowAggregates(view, FIVE_H_MS, fiveOrigin, sessionSpan.since, sessionSpan.until),
		loadWindowAggregates(view, SEVEN_D_MS, weekOrigin, weekSpan.since, weekSpan.until),
		loadWindowPeaks(view.account?.id ?? null, '5h', FIVE_H_MS, fiveOrigin, sessionSpan.since),
		loadWindowPeaks(view.account?.id ?? null, '7d', SEVEN_D_MS, weekOrigin, weekSpan.since),
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
		sessions: buildPastWindows(sessionRows, sessionStarts, FIVE_H_MS, sessionPeaks, ttl, label),
		weeks: buildPastWindows(weekRows, weekStarts, SEVEN_D_MS, weekPeaks, ttl, label),
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
	devices: { id: string; name: string; groupId: string | null }[]
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
			.select({ groupId: devices.groupId, id: devices.id, name: devices.name })
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
 * the largest row per logical message), grouped by (cwd × model) because
 * pricing is per model; the models are then summed away per project here.
 */
export async function getProjectUsage(userId: string, now = new Date()): Promise<ProjectUsage[]> {
	const since = new Date(now.getTime() - PROJECT_DAYS * 24 * 60 * 60 * 1000)
	await refreshPrices()
	const settings = await ensureSettings(userId)
	const result = await db.execute(sql`
    WITH folded AS (
      SELECT DISTINCT ON (${FOLD_KEY})
        ${usageEvents.ts} AS ts,
        ${usageEvents.cwd} AS cwd,
        ${usageEvents.model} AS model,
        ${usageEvents.inputTokens} AS input_tokens,
        ${usageEvents.outputTokens} AS output_tokens,
        ${usageEvents.cacheCreationTokens} AS cache_creation_tokens,
        ${usageEvents.cacheReadTokens} AS cache_read_tokens
      FROM ${usageEvents}
      WHERE ${usageEvents.userId} = ${userId}
        AND ${usageEvents.ts} >= ${since.toISOString()}::timestamptz
      ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
    )
    SELECT
      folded.cwd AS cwd,
      folded.model AS model,
      max(folded.ts) AS last_ts,
      sum(folded.input_tokens)::bigint AS input,
      sum(folded.output_tokens)::bigint AS output,
      sum(folded.cache_creation_tokens)::bigint AS cache_creation,
      sum(folded.cache_read_tokens)::bigint AS cache_read
    FROM folded
    GROUP BY 1, 2
    HAVING (
      sum(folded.input_tokens) + sum(folded.output_tokens) +
      sum(folded.cache_creation_tokens) + sum(folded.cache_read_tokens)
    ) > 0
  `)

	const rows = result as unknown as {
		cwd: string | null
		model: string | null
		last_ts: string | Date
		input: string
		output: string
		cache_creation: string
		cache_read: string
	}[]
	const ttl: CacheTtl = settings.cacheWriteTtl === '1h' ? '1h' : '5m'
	const byPath = new Map<string, ProjectUsage>()
	for (const r of rows) {
		const totals = {
			cacheCreationTokens: Number(r.cache_creation),
			cacheReadTokens: Number(r.cache_read),
			inputTokens: Number(r.input),
			outputTokens: Number(r.output),
			totalTokens: Number(r.input) + Number(r.output) + Number(r.cache_creation) + Number(r.cache_read),
		} satisfies TokenTotals
		const lastActive = new Date(r.last_ts).toISOString()
		const cur = byPath.get(r.cwd ?? '')
		if (cur) {
			cur.billableTokens += billableTokens(totals)
			cur.totalTokens += totals.totalTokens
			cur.costUsd += costForTokens(totals, r.model, ttl)
			cur.lastActive = lastActive > cur.lastActive ? lastActive : cur.lastActive
		} else {
			byPath.set(r.cwd ?? '', {
				billableTokens: billableTokens(totals),
				costUsd: costForTokens(totals, r.model, ttl),
				lastActive,
				path: r.cwd,
				totalTokens: totals.totalTokens,
			})
		}
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
