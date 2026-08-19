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
 * and, worse, merging idle intervals into active ones, which hid off-fleet usage
 * that should have read as unattributed. What remains of the delay is fitted per
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

/** An ISO string from a collector, or null when it is absent or unparseable. */
export function toDate(v: string | null | undefined): Date | null {
	if (!v) {
		return null
	}
	const d = new Date(v)
	return Number.isNaN(d.getTime()) ? null : d
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
