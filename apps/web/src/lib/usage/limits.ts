/**
 * How long a reported utilization reading stays trustworthy. The collector's
 * limits leg can die on its own (it needs live Claude credentials) while usage
 * upload keeps working, and nothing decays the stored percentage — so past this
 * age a reading is treated as absent rather than current. Shared by the
 * dashboard's "offline" badge and by the prompt-blocking read, which must not
 * refuse work on a percentage whose window has long since reset.
 *
 * ponytail: three times the collector's default 300s limits interval. An
 * operator who raises USAGEFLEET_LIMITS_INTERVAL past this turns prompt
 * blocking off across the fleet, silently. Derive it from the reported interval
 * if that combination ever needs to work.
 */
export const LIMITS_STALE_MS = 15 * 60 * 1000

/**
 * Readings landing closer together than this are one reading. Every device polls
 * Anthropic once a minute and posts what it read, so two readings inside one
 * minute are the same moment seen by two machines and the boundary between them
 * is noise, not information.
 *
 * This used to be five minutes, to absorb an unmeasured delay between an event's
 * timestamp and Anthropic's meter. Measured on real accounts that delay is under
 * a minute — while the five-minute bound was dropping ~25% of all recorded rises
 * and, worse, merging idle intervals into active ones, which pinned off-fleet
 * usage on whoever was active next to it. What remains of the delay is fitted per
 * account instead (`Calibration.lagMs`), which is falsifiable where a constant is
 * not.
 */
export const MERGE_INTERVAL_MS = 60 * 1000

/**
 * Collapse readings that fall within one {@link MERGE_INTERVAL_MS} of the last
 * kept one; a dropped reading's rise carries forward to the next kept one.
 *
 * Shared on purpose: the split and the fit that certifies it must walk the same
 * series, or the held-out gate scores a sampling that never reaches production.
 *
 * `since` anchors the first interval — pass a window start to merge the first
 * reading against it, or leave it at 0 to always keep the earliest reading.
 */
export function mergePoints<T extends { at: Date }>(points: T[], since = 0): T[] {
	const out: T[] = []
	let last = since
	for (const p of points.toSorted((a, b) => a.at.getTime() - b.at.getTime())) {
		if (p.at.getTime() - last >= MERGE_INTERVAL_MS) {
			out.push(p)
			last = p.at.getTime()
		}
	}
	return out
}

const PACE_LOOKBACK_MS = 60 * 60 * 1000
const MIN_WINDOW_AGE_MS = 30 * 60 * 1000

export interface SessionProjection {
	/** Where the session pct ends at the reset if the last hour's pace holds, capped at 100. */
	pct: number
	/** When that pace reaches 100%, or null when the reset comes first. */
	fullAt: Date | null
	/** The next full ten under 100 and when the pace reaches it, or null when the reset or the limit comes first. */
	next: { at: Date; pct: number } | null
}

/**
 * The 5h window run forward at the pace of its last hour. Measured on production
 * readings (5 accounts, 90 windows) this beats "it stays where it is" at every
 * pct, and on the windows that really hit 100% it named the time within ~5
 * minutes. A 24h pace did worse than standing still on the weekly window, so
 * there is no weekly counterpart. Null in a window's first half hour (too few
 * whole-point rises to read a pace from), when nothing rose in the last hour, or
 * once the limit is reached.
 */
export function projectSession(
	rises: { at: Date; pct: number }[],
	pct: number,
	windowStart: Date,
	resetsAt: Date,
	now: Date,
): SessionProjection | null {
	const age = now.getTime() - windowStart.getTime()
	if (age < MIN_WINDOW_AGE_MS || pct >= 100) {
		return null
	}
	const from = now.getTime() - Math.min(PACE_LOOKBACK_MS, age)
	let pctThen = 0
	for (const rise of rises) {
		if (rise.at.getTime() >= windowStart.getTime() && rise.at.getTime() <= from) {
			pctThen = Math.max(pctThen, rise.pct)
		}
	}
	const perMs = (pct - pctThen) / (now.getTime() - from)
	if (perMs <= 0) {
		return null
	}
	const reachAt = (target: number) => new Date(now.getTime() + (target - pct) / perMs)
	const nextPct = Math.floor(pct / 10) * 10 + 10
	const next = nextPct < 100 && reachAt(nextPct) < resetsAt ? { at: reachAt(nextPct), pct: nextPct } : null
	const fullAt = reachAt(100)
	if (fullAt < resetsAt) {
		return { fullAt, next, pct: 100 }
	}
	return { fullAt: null, next, pct: pct + perMs * (resetsAt.getTime() - now.getTime()) }
}

/** An ISO string from a collector, or null when it is absent or unparseable. */
export function toDate(v: string | null | undefined): Date | null {
	if (!v) {
		return null
	}
	const d = new Date(v)
	return Number.isNaN(d.getTime()) ? null : d
}

/** Whether two reset stamps name the same reset; oauth/usage jitters them by under a second. */
export function sameReset(a: string | null, b: string | null): boolean {
	if (a === null || b === null) {
		return a === b
	}
	return Math.abs(Date.parse(a) - Date.parse(b)) < 60_000
}

/** The window fields of a limits report, as the collector sends them. */
interface WindowReport {
	fiveHourPct?: number | null
	sevenDayPct?: number | null
	fiveHourResetsAt?: string | null
	sevenDayResetsAt?: string | null
}

/**
 * The limit columns a report is allowed to write. Anthropic's oauth/usage
 * endpoint drops a window on any hiccup and the collector still reports the one
 * it did get, so a window is only overwritten when this report carried it —
 * storing the null would read as 0% on the dashboard until the next cycle,
 * while the last-known-good value is still roughly true. Same last-known-good
 * rule the per-model limits already follow.
 */
export function reportedWindows(b: WindowReport) {
	return {
		...(b.fiveHourPct != null && { fiveHourPct: b.fiveHourPct, fiveHourResetsAt: toDate(b.fiveHourResetsAt) }),
		...(b.sevenDayPct != null && { sevenDayPct: b.sevenDayPct, sevenDayResetsAt: toDate(b.sevenDayResetsAt) }),
	}
}
