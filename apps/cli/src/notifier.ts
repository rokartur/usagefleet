import type { LimitsReport } from './claude-limits.js'
import { flagOff } from './config.js'
import { sendNotification } from './notify.js'
import type { Urgency } from './notify.js'
import { readStore, storePath, updateStore } from './store.js'
import type { NotifyMode, Store, WindowNotifyState } from './types.js'
import type { Log } from './ui.js'

export interface NotifyConfig {
	enabled: boolean
	/** Ascending utilization thresholds (%) that trigger a notification once each
	 *  per window, e.g. [80, 95]. */
	thresholds: number[]
}

/** Thresholds per mode. `critical` thins out near the wall on purpose: the last
 *  few points are where a window is actually lost, so they get a tenth-of-a-point
 *  step. Mirrored by the Devices page (apps/web/src/lib/notify-modes.ts). */
export const NOTIFY_MODES: Record<NotifyMode, number[]> = {
	critical: [80, 90, 95, 96, 97, 98, 99, 99.1, 99.2, 99.3, 99.4, 99.5, 99.6, 99.7, 99.8, 99.9, 100],
	off: [],
	quiet: [95, 100],
	standard: [80, 95],
	steady: [50, 60, 70, 80, 90, 95, 100],
}

const DEFAULT_MODE: NotifyMode = 'standard'

/** Points under the mark pct must fall before the mark is lowered and re-armed. */
const REARM_MARGIN = 5

/** Case-insensitive; anything that is not a mode name is null, so a typo in one
 *  layer falls through to the next instead of silencing every alert. */
export function parseNotifyMode(value: unknown): NotifyMode | null {
	const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
	return Object.hasOwn(NOTIFY_MODES, mode) ? (mode as NotifyMode) : null
}

/** Resolve notify config, env first then the config file. Enabled by default;
 *  disable with USAGEFLEET_NOTIFY=0 (also: false/off/no) or `"notifications":
 *  false`. The preset comes from USAGEFLEET_NOTIFY_MODE, the `notifyMode` file
 *  key, then `serverMode` (the one set for this device on the Devices page);
 *  an explicit list from USAGEFLEET_NOTIFY_THRESHOLDS (comma list, e.g.
 *  "50,80,95") or a `notifyThresholds` array replaces the preset's thresholds. */
export function loadNotifyConfig(
	env: Record<string, string | undefined> = process.env,
	file: Pick<Store, 'notifications' | 'notifyMode' | 'notifyThresholds'> = readStore(),
	serverMode: NotifyMode | null = null,
): NotifyConfig {
	const mode =
		parseNotifyMode(env.USAGEFLEET_NOTIFY_MODE) ?? parseNotifyMode(file.notifyMode) ?? serverMode ?? DEFAULT_MODE
	const enabled = !flagOff(env.USAGEFLEET_NOTIFY, file.notifications) && mode !== 'off'

	const raw = env.USAGEFLEET_NOTIFY_THRESHOLDS
	const candidates = raw?.trim() ? raw.split(',').map(s => Number(s.trim())) : (file.notifyThresholds ?? [])
	// One decimal, like the readings themselves: 99.1 must stay 99.1.
	const parsed = candidates.map(n => Math.round(n * 10) / 10).filter(n => Number.isFinite(n) && n > 0 && n <= 100)
	const thresholds = parsed.length > 0 ? [...new Set(parsed)].toSorted((a, b) => a - b) : NOTIFY_MODES[mode]
	return { enabled, thresholds }
}

/**
 * Decide whether a window crosses a not-yet-notified threshold. Pure — no IO.
 * Returns the threshold to fire (or null) and the next persisted state.
 *
 * A window rollover (resetsAt moves) resets the high-water mark first, so the
 * first crossing in a new window always re-notifies. If utilization later drops
 * well below the mark within the SAME window (e.g. a server correction), the mark
 * is lowered so a subsequent re-cross notifies again. A small dip does not move
 * it: a group's slice is derived and wobbles between readings, and a mark that
 * followed every wobble would re-alert each time pct straddled a threshold.
 */
export function evaluateWindow(
	prev: WindowNotifyState | undefined,
	pct: number | null,
	resetsAt: string | null,
	thresholds: number[],
): { fire: number | null; next: WindowNotifyState } {
	const rolledOver = !prev || !sameWindow(prev.resetsAt, resetsAt)
	const lastBucket = rolledOver ? 0 : prev.lastBucket
	// Within a window the first resetsAt stays, so the jitter alone never rewrites the store.
	const windowResetsAt = rolledOver ? resetsAt : prev.resetsAt

	if (pct == null) {
		// No reading this cycle — keep the mark, just track the (possibly new) window.
		return { fire: null, next: { lastBucket, resetsAt: windowResetsAt } }
	}

	// Highest threshold the current pct has reached (thresholds are ascending).
	let top = 0
	for (const t of thresholds) {
		if (pct >= t) {
			top = t
		}
	}

	if (top > lastBucket) {
		return { fire: top, next: { lastBucket: top, resetsAt: windowResetsAt } }
	}
	// top <= lastBucket: nothing fires. The mark holds through a wobble and follows
	// pct down only on a real drop.
	const mark = pct < lastBucket - REARM_MARGIN ? top : lastBucket
	return { fire: null, next: { lastBucket: mark, resetsAt: windowResetsAt } }
}

// oauth/usage jitters resets_at by milliseconds per request; a real rollover moves it by hours.
function sameWindow(a: string | null, b: string | null): boolean {
	if (a === null || b === null) {
		return a === b
	}
	return Math.abs(Date.parse(a) - Date.parse(b)) < 60_000
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

/** `critical` is sticky on most Linux daemons, so only the first alert in the danger
 *  zone and the wall itself get it; a dense tail (99.1, 99.2, ...) must not pile up. */
function urgencyFor(bucket: number, thresholds: number[]): Urgency {
	return bucket === thresholds.find(t => t >= 95) || bucket >= 100 ? 'critical' : 'normal'
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

		const fmt = (n: number) => {
			const s = n.toFixed(1)
			return s.endsWith('.0') ? s.slice(0, -2) : s
		}
		const fivePct = fmt(report.fiveHourPct ?? 0)
		const sevenPct = fmt(report.sevenDayPct ?? 0)
		if (five.fire != null) {
			sendNotification(
				'Claude usage · 5-hour limit',
				`${fivePct}% of your 5-hour limit used${resetSuffix(report.fiveHourResetsAt)}.`,
				{ urgency: urgencyFor(five.fire, cfg.thresholds) },
			)
			log('ok', `notified · 5h at ${fivePct}% · crossed ${five.fire}%`)
		}
		if (seven.fire != null) {
			sendNotification(
				'Claude usage · weekly limit',
				`${sevenPct}% of your weekly limit used${resetSuffix(report.sevenDayResetsAt)}.`,
				{ urgency: urgencyFor(seven.fire, cfg.thresholds) },
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
