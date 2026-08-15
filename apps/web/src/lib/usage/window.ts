import { foldAndSum } from './fold'
import type { TokenTotals, UsageRecord } from './types'

/**
 * Start of the current weekly window: the most recent occurrence of
 * `weekday`@`hourUtc` (UTC) at or before `now`. weekday: 0=Sun..6=Sat.
 */
export function weekWindowStart(now: Date, weekday: number, hourUtc: number): Date {
	const d = new Date(now)
	d.setUTCHours(hourUtc, 0, 0, 0)
	const dayDiff = (d.getUTCDay() - weekday + 7) % 7
	d.setUTCDate(d.getUTCDate() - dayDiff)
	if (d.getTime() > now.getTime()) {
		d.setUTCDate(d.getUTCDate() - 7)
	}
	return d
}

/**
 * Starts of the `count` most recent COMPLETED windows of length `strideMs`,
 * newest first. `origin` is any known boundary of that window series — e.g. the
 * collector-reported `resets_at`, which sits in the *future* — so the windows
 * line up with Claude's real reset schedule instead of an arbitrary "now minus
 * 5h". The window containing `now` is excluded (it is still filling).
 */
export function pastWindowStarts(origin: Date, strideMs: number, now: Date, count: number): Date[] {
	const elapsed = now.getTime() - origin.getTime()
	const currentStart = origin.getTime() + Math.floor(elapsed / strideMs) * strideMs
	return Array.from({ length: count }, (_, i) => new Date(currentStart - (i + 1) * strideMs))
}

export function filterByWindow(events: UsageRecord[], start: Date, end: Date): UsageRecord[] {
	const s = start.getTime()
	const e = end.getTime()
	return events.filter(x => {
		const t = x.ts.getTime()
		return t >= s && t <= e
	})
}

/** Folded token totals for the current weekly window. */
export function weeklyTotals(
	events: UsageRecord[],
	now: Date,
	weekday: number,
	hourUtc: number,
): { start: Date; totals: TokenTotals } {
	const start = weekWindowStart(now, weekday, hourUtc)
	return { start, totals: foldAndSum(filterByWindow(events, start, now)) }
}
