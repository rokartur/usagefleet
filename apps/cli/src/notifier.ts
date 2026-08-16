import type { LimitsReport } from './claude-limits.js'
import { sendNotification } from './notify.js'
import type { Urgency } from './notify.js'
import { readStore, storePath, updateStore } from './store.js'
import type { WindowNotifyState } from './types.js'
import type { Log } from './ui.js'

export interface NotifyConfig {
	enabled: boolean
	/** Ascending utilization thresholds (%) that trigger a notification once each
	 *  per window, e.g. [80, 95]. */
	thresholds: number[]
}

const DEFAULT_THRESHOLDS = [80, 95]

/** Resolve notify config from env. Enabled by default; disable with
 *  USAGEFLEET_NOTIFY=0 (also: false/off/no). Thresholds from
 *  USAGEFLEET_NOTIFY_THRESHOLDS as a comma list (e.g. "50,80,95"). */
export function loadNotifyConfig(env: Record<string, string | undefined> = process.env): NotifyConfig {
	const flag = env.USAGEFLEET_NOTIFY
	const enabled = flag == null || !/^(0|false|off|no)$/i.test(flag.trim())

	let thresholds = DEFAULT_THRESHOLDS
	const raw = env.USAGEFLEET_NOTIFY_THRESHOLDS
	if (raw && raw.trim()) {
		const parsed = raw
			.split(',')
			.map(s => Math.round(Number(s.trim())))
			.filter(n => Number.isFinite(n) && n > 0 && n <= 100)
		if (parsed.length > 0) {
			thresholds = [...new Set(parsed)].toSorted((a, b) => a - b)
		}
	}
	return { enabled, thresholds }
}

/**
 * Decide whether a window crosses a not-yet-notified threshold. Pure — no IO.
 * Returns the threshold to fire (or null) and the next persisted state.
 *
 * A window rollover (resetsAt change) resets the high-water mark first, so the
 * first crossing in a new window always re-notifies. If utilization later drops
 * below the mark within the SAME window (e.g. a server correction), the mark is
 * lowered so a subsequent re-cross notifies again.
 */
export function evaluateWindow(
	prev: WindowNotifyState | undefined,
	pct: number | null,
	resetsAt: string | null,
	thresholds: number[],
): { fire: number | null; next: WindowNotifyState } {
	const rolledOver = !prev || prev.resetsAt !== resetsAt
	const lastBucket = rolledOver ? 0 : prev.lastBucket

	if (pct == null) {
		// No reading this cycle — keep the mark, just track the (possibly new) window.
		return { fire: null, next: { lastBucket, resetsAt } }
	}

	// Highest threshold the current pct has reached (thresholds are ascending).
	let top = 0
	for (const t of thresholds) {
		if (pct >= t) {
			top = t
		}
	}

	if (top > lastBucket) {
		return { fire: top, next: { lastBucket: top, resetsAt } }
	}
	if (top < lastBucket) {
		return { fire: null, next: { lastBucket: top, resetsAt } }
	}
	return { fire: null, next: { lastBucket, resetsAt } }
}

/** Relative "resets in 12m" / "resets in 2h" suffix, or "" if unknown/past. */
function resetSuffix(resetsAt: string | null): string {
	if (!resetsAt) {
		return ''
	}
	const ms = new Date(resetsAt).getTime() - Date.now()
	if (!Number.isFinite(ms) || ms <= 0) {
		return ''
	}
	const min = Math.round(ms / 60_000)
	if (min < 60) {
		return ` · resets in ${min}m`
	}
	const h = Math.round(min / 60)
	if (h < 48) {
		return ` · resets in ${h}h`
	}
	return ` · resets in ${Math.round(h / 24)}d`
}

function urgencyFor(bucket: number): Urgency {
	return bucket >= 95 ? 'critical' : 'normal'
}

/**
 * Notify on freshly-crossed 5h/weekly thresholds, deduped across runs via the
 * store's `notify` section. Best-effort and self-contained: it owns its state
 * IO and never throws out to the caller.
 */
export function maybeNotify(
	report: LimitsReport,
	cfg: NotifyConfig = loadNotifyConfig(),
	log: Log = () => {
		/* empty */
	},
	path: string = storePath(),
): void {
	if (!cfg.enabled || cfg.thresholds.length === 0) {
		return
	}
	try {
		const state = readStore(path).notify
		const five = evaluateWindow(state.fiveHour, report.fiveHourPct, report.fiveHourResetsAt, cfg.thresholds)
		const seven = evaluateWindow(state.sevenDay, report.sevenDayPct, report.sevenDayResetsAt, cfg.thresholds)

		// Readings can carry a decimal; notification copy rounds to whole.
		const fivePct = Math.round(report.fiveHourPct ?? 0)
		const sevenPct = Math.round(report.sevenDayPct ?? 0)
		if (five.fire != null) {
			sendNotification(
				'Claude usage · 5-hour limit',
				`${fivePct}% of your 5-hour limit used${resetSuffix(report.fiveHourResetsAt)}.`,
				{ urgency: urgencyFor(five.fire) },
			)
			log('ok', `notified · 5h at ${fivePct}% · crossed ${five.fire}%`)
		}
		if (seven.fire != null) {
			sendNotification(
				'Claude usage · weekly limit',
				`${sevenPct}% of your weekly limit used${resetSuffix(report.sevenDayResetsAt)}.`,
				{ urgency: urgencyFor(seven.fire) },
			)
			log('ok', `notified · weekly at ${sevenPct}% · crossed ${seven.fire}%`)
		}

		updateStore(path, store => {
			store.notify = { fiveHour: five.next, sevenDay: seven.next }
		})
	} catch (error) {
		log('warn', `notify skipped · ${(error as Error).message}`)
	}
}
