import { billableTokens, foldEvents, sumTokens } from './fold'
import type { TokenTotals, UsageRecord } from './types'

/**
 * Version digits of a raw model id, ignoring the "[1m]" context-variant tag and a
 * -YYYYMMDD snapshot date, so single-number versions work as well as major.minor:
 * "opus-5[1m]" → ["5"], "opus-4-8-20251101" → ["4","8"], "3-5-sonnet-…" → ["3","5"].
 */
export function versionParts(model: string): string[] {
	return (
		model
			.replace(/\[.*$/, '')
			.replace(/-\d{8}$/, '')
			.match(/\d+/g) ?? []
	)
}

/**
 * Friendly display label for a raw Claude model id
 * (e.g. "claude-opus-4-8-20251101" → "Opus 4.8"). Unknown families fall back to
 * the raw id so nothing is silently hidden.
 */
export function modelLabel(model: string | null | undefined): string {
	if (!model) {
		return 'Unknown'
	}
	const m = model.toLowerCase()
	const family = m.includes('opus')
		? 'Opus'
		: m.includes('sonnet')
			? 'Sonnet'
			: m.includes('haiku')
				? 'Haiku'
				: m.includes('fable')
					? 'Fable'
					: m.includes('mythos')
						? 'Mythos'
						: null
	if (!family) {
		return model
	}
	const [major, minor] = versionParts(m)
	if (!major) {
		return family
	}
	return `${family} ${minor ? `${major}.${minor}` : major}`
}

/** Per-model token totals for a group/window. */
export interface ModelUsage {
	/** Raw model id (or "unknown" when the event carried no model). */
	model: string
	/** Friendly label, e.g. "Opus 4.8". */
	label: string
	/** Precise per-bucket totals (input / output / cache create / cache read). */
	totals: TokenTotals
	/** input + output + cache_creation (EXCLUDES replayed cache reads), matching
	 *  the billable measure used for the group share split. */
	billableTokens: number
}

/**
 * Break a set of events down by model. Folds streamed segments FIRST (one model
 * per logical message), then groups the folded rows by model and sums each.
 * Sorted by billable tokens desc, with total tokens as a tiebreaker.
 */
export function modelBreakdown(events: UsageRecord[]): ModelUsage[] {
	// Key by the raw id ("unknown" when absent), but keep the original (possibly
	// null) model so the label reads "Unknown" rather than the literal key.
	const byModel = new Map<string, { model: string | null; evs: UsageRecord[] }>()
	for (const e of foldEvents(events)) {
		const key = e.model ?? 'unknown'
		const cur = byModel.get(key)
		if (cur) {
			cur.evs.push(e)
		} else {
			byModel.set(key, { evs: [e], model: e.model ?? null })
		}
	}
	const out: ModelUsage[] = []
	for (const [key, { model, evs }] of byModel) {
		const totals = sumTokens(evs)
		// Skip token-less pseudo-models (e.g. "<synthetic>" rows Claude Code emits
		// for compaction / synthetic messages) — they'd render as empty 0/0/0 rows.
		if (totals.totalTokens === 0) {
			continue
		}
		out.push({
			billableTokens: billableTokens(totals),
			label: modelLabel(model),
			model: key,
			totals,
		})
	}
	out.sort((a, b) => b.billableTokens - a.billableTokens || b.totals.totalTokens - a.totals.totalTokens)
	return out
}
