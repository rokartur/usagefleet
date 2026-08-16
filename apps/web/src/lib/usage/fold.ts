import { EMPTY_TOTALS } from './types'
import type { TokenCounts, TokenTotals, UsageRecord } from './types'

/** Every token the row carries, cache reads included. Takes any TokenCounts so
 *  raw records, folded rows and daily aggregates all total the same way. */
export function recordTotal(t: TokenCounts): number {
	return t.inputTokens + t.outputTokens + t.cacheCreationTokens + t.cacheReadTokens
}

/**
 * Collapse streamed segments to one representative per logical message.
 *
 * Claude Code writes a single `message.id` across MANY JSONL lines (one per
 * streamed content segment), each with its own `uuid` and a (growing) usage
 * object. Summing every line double-counts massively. We key by
 * (messageId, requestId) and keep the row with the largest token total — the
 * terminal/most-complete segment. Lines without a messageId fall back to their
 * unique uuid (already 1:1).
 */
export function foldEvents(events: UsageRecord[]): UsageRecord[] {
	const byKey = new Map<string, UsageRecord>()
	for (const e of events) {
		const key = e.messageId ? `m:${e.messageId}::${e.requestId ?? ''}` : `u:${e.uuid}`
		const prev = byKey.get(key)
		if (!prev || recordTotal(e) > recordTotal(prev)) {
			byKey.set(key, e)
		}
	}
	return [...byKey.values()]
}

/** Sum anything carrying the four token counts — folded records or pre-bucketed
 *  daily aggregates — WITHOUT folding. Callers filter first, and pass already-
 *  folded input: which rows belong in a total is their question, not this one's. */
export function sumTokens(rows: readonly TokenCounts[]): TokenTotals {
	const t = { ...EMPTY_TOTALS }
	for (const r of rows) {
		t.inputTokens += r.inputTokens
		t.outputTokens += r.outputTokens
		t.cacheCreationTokens += r.cacheCreationTokens
		t.cacheReadTokens += r.cacheReadTokens
	}
	t.totalTokens = t.inputTokens + t.outputTokens + t.cacheCreationTokens + t.cacheReadTokens
	return t
}

/** "Billable" tokens = input + output + cache_creation (EXCLUDES cache_read,
 *  which is replayed context and ~97% of raw totals — see usage.test.ts).
 *  Display metric only; group splits weigh by estimated cost (pricing.ts). */
export function billableTokens(t: TokenCounts): number {
	return t.inputTokens + t.outputTokens + t.cacheCreationTokens
}
