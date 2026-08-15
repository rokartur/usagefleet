import { utcDay } from './chart'
import { EMPTY_TOTALS } from './types'
import type { TokenTotals } from './types'

/**
 * One pre-folded, pre-bucketed usage aggregate: the token sums for a single
 * (UTC calendar day × group × model) cell. Produced DB-side by
 * `loadDailyAggregates` (folding is applied in SQL), so the scanned range
 * collapses to a small set of rows the dashboard can sum cheaply. The scan
 * itself is not cheap: per-request callers pass its `since` bound, and only
 * `getHistory` goes all-time, from behind a cache.
 */
export interface DailyAggRow {
	/** UTC day, "YYYY-MM-DD". */
	day: string
	/** Device's group, or null (rendered as the "ungrouped" key). */
	groupId: string | null
	/** Raw model id, or null ("unknown" key). */
	model: string | null
	/** Originating app: "cli" / "desktop" / "pi", or null (read as "cli"). */
	source: string | null
	/** Device that produced the rows, or null ("unknown" key). */
	deviceId: string | null
	inputTokens: number
	outputTokens: number
	cacheCreationTokens: number
	cacheReadTokens: number
}

/** UTC "YYYY-MM" for a Date. */
export function monthKey(d: Date): string {
	return utcDay(d).slice(0, 7)
}

/** Sum a set of aggregate rows. Callers filter first — which rows belong in a
 *  total is their question, not this one's. */
export function sumAgg(rows: DailyAggRow[]): TokenTotals {
	const t: TokenTotals = { ...EMPTY_TOTALS }
	for (const r of rows) {
		t.inputTokens += r.inputTokens
		t.outputTokens += r.outputTokens
		t.cacheCreationTokens += r.cacheCreationTokens
		t.cacheReadTokens += r.cacheReadTokens
		t.totalTokens += r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens
	}
	return t
}
