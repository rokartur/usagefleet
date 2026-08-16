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
