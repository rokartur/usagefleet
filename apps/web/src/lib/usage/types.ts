/** Minimal shape needed for all usage math. DB rows and ingest records both
 *  satisfy this. `ts` is a real Date (UTC instant). */
export interface UsageRecord {
	uuid: string
	messageId: string | null
	requestId: string | null
	model: string | null
	ts: Date
	inputTokens: number
	outputTokens: number
	cacheCreationTokens: number
	cacheReadTokens: number
	/** Per-TTL split of cacheCreationTokens (see TokenCounts). */
	cacheCreation5mTokens?: number
	cacheCreation1hTokens?: number
	groupId?: string | null
	deviceId?: string | null
	/** Which app produced the row: 'cli' (Claude Code), 'desktop', or 'pi'. */
	source?: string | null
}

export interface TokenTotals {
	inputTokens: number
	outputTokens: number
	cacheCreationTokens: number
	cacheReadTokens: number
	totalTokens: number
}

/** The four raw token counts, shared by ingest records, folded rows, daily
 *  aggregates and totals. Anything summable is summable through this. Note
 *  "billable" means something narrower here — see billableTokens in fold.ts,
 *  which excludes cache reads.
 *
 *  The optional cacheCreation5m/1h fields are the per-TTL split of
 *  cacheCreationTokens where the log carried it — 5m and 1h writes price
 *  differently, and any untagged remainder is priced by the user's TTL
 *  setting (see costForTokens). */
export type TokenCounts = Pick<
	TokenTotals,
	'inputTokens' | 'outputTokens' | 'cacheCreationTokens' | 'cacheReadTokens'
> & {
	cacheCreation5mTokens?: number
	cacheCreation1hTokens?: number
}

export const EMPTY_TOTALS: TokenTotals = {
	cacheCreationTokens: 0,
	cacheReadTokens: 0,
	inputTokens: 0,
	outputTokens: 0,
	totalTokens: 0,
}
