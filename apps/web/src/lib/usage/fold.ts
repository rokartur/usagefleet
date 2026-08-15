import { EMPTY_TOTALS } from './types'
import type { TokenTotals, UsageRecord } from './types'

export function recordTotal(e: UsageRecord): number {
	return e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens
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

/** Sum a list of records WITHOUT folding. Use on already-folded input. */
export function sumRecords(events: UsageRecord[]): TokenTotals {
	const t = { ...EMPTY_TOTALS }
	for (const e of events) {
		t.inputTokens += e.inputTokens
		t.outputTokens += e.outputTokens
		t.cacheCreationTokens += e.cacheCreationTokens
		t.cacheReadTokens += e.cacheReadTokens
	}
	t.totalTokens = t.inputTokens + t.outputTokens + t.cacheCreationTokens + t.cacheReadTokens
	return t
}

/** "Billable" tokens = input + output + cache_creation (EXCLUDES cache_read,
 *  which is replayed context and ~97% of raw totals — see usage.test.ts).
 *  Display metric only; group splits weigh by estimated cost (pricing.ts). */
export function billableTokens(t: TokenTotals): number {
	return t.inputTokens + t.outputTokens + t.cacheCreationTokens
}
