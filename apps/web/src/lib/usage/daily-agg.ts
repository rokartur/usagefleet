import { utcDay } from './chart'

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

// Summing these is `sumTokens` in fold.ts: a DailyAggRow satisfies TokenCounts.
