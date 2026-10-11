import { describe, expect, it } from 'vitest'
import { NOTIFY_MODES, evaluateWindow, loadNotifyConfig, parseNotifyMode } from './notifier.js'

describe(loadNotifyConfig, () => {
	it('defaults to enabled with 80/95 thresholds', () => {
		expect(loadNotifyConfig({}, {})).toStrictEqual({
			enabled: true,
			thresholds: [80, 95],
		})
	})

	it('disables on falsey flags (case-insensitive)', () => {
		for (const v of ['0', 'false', 'off', 'NO', ' Off ']) {
			expect(loadNotifyConfig({ USAGEFLEET_NOTIFY: v }, {}).enabled).toBeFalsy()
		}
	})

	it('stays enabled for other values', () => {
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY: '1' }, {}).enabled).toBeTruthy()
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY: 'yes' }, {}).enabled).toBeTruthy()
	})

	it('reads the config file keys, env winning', () => {
		expect(loadNotifyConfig({}, { notifications: false }).enabled).toBeFalsy()
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY: '1' }, { notifications: false }).enabled).toBeTruthy()
		expect(loadNotifyConfig({}, { notifyThresholds: [90, 50] }).thresholds).toStrictEqual([50, 90])
		expect(
			loadNotifyConfig({ USAGEFLEET_NOTIFY_THRESHOLDS: '70' }, { notifyThresholds: [90] }).thresholds,
		).toStrictEqual([70])
	})

	it('parses, dedups, sorts, and bounds thresholds', () => {
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY_THRESHOLDS: '95, 50,80, 80' }, {}).thresholds).toStrictEqual([
			50, 80, 95,
		])
	})

	it('keeps one decimal, so the 99.x tail is expressible', () => {
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY_THRESHOLDS: '99.1, 99.14, 99' }, {}).thresholds).toStrictEqual([
			99, 99.1,
		])
	})

	it('picks the preset: env, then file, then the server, then standard', () => {
		const th = (...args: Parameters<typeof loadNotifyConfig>) => loadNotifyConfig(...args).thresholds
		expect(th({}, {}, 'critical')).toStrictEqual(NOTIFY_MODES.critical)
		expect(th({}, { notifyMode: 'quiet' }, 'critical')).toStrictEqual(NOTIFY_MODES.quiet)
		expect(th({ USAGEFLEET_NOTIFY_MODE: ' Steady ' }, { notifyMode: 'quiet' }, 'critical')).toStrictEqual(
			NOTIFY_MODES.steady,
		)
		// A typo in one layer falls through instead of silencing alerts.
		expect(th({ USAGEFLEET_NOTIFY_MODE: 'loud' }, {}, 'critical')).toStrictEqual(NOTIFY_MODES.critical)
		expect(th({}, {}, null)).toStrictEqual(NOTIFY_MODES.standard)
	})

	it('an explicit list replaces the preset', () => {
		expect(loadNotifyConfig({}, { notifyThresholds: [70] }, 'critical').thresholds).toStrictEqual([70])
	})

	it('mode off disables, whatever else is set', () => {
		expect(loadNotifyConfig({}, {}, 'off').enabled).toBeFalsy()
		expect(
			loadNotifyConfig({ USAGEFLEET_NOTIFY_MODE: 'off' }, { notifyThresholds: [70] }, 'critical').enabled,
		).toBeFalsy()
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY_MODE: 'quiet' }, {}, 'off').enabled).toBeTruthy()
	})

	it('drops out-of-range / non-numeric entries and falls back when empty', () => {
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY_THRESHOLDS: '0,101,-5,abc' }, {}).thresholds).toStrictEqual([
			80, 95,
		])
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY_THRESHOLDS: '  ' }, {}).thresholds).toStrictEqual([80, 95])
		expect(loadNotifyConfig({}, { notifyThresholds: [0, 200] }).thresholds).toStrictEqual([80, 95])
	})
})

describe(parseNotifyMode, () => {
	it('knows the five modes and nothing else', () => {
		expect(Object.keys(NOTIFY_MODES).toSorted()).toStrictEqual(['critical', 'off', 'quiet', 'standard', 'steady'])
		expect(parseNotifyMode('CRITICAL')).toBe('critical')
		expect(parseNotifyMode('toString')).toBeNull()
		expect(parseNotifyMode(null)).toBeNull()
		expect(parseNotifyMode(3)).toBeNull()
	})

	it('every preset is ascending, unique and within (0, 100]', () => {
		for (const list of Object.values(NOTIFY_MODES)) {
			expect(list).toStrictEqual([...new Set(list)].toSorted((a, b) => a - b))
			expect(list.every(n => n > 0 && n <= 100)).toBeTruthy()
		}
	})
})

describe(evaluateWindow, () => {
	const TH = [80, 95]
	const reset = '2026-06-23T12:00:00Z'

	it('fires the highest crossed threshold and records it', () => {
		const r = evaluateWindow(undefined, 82, reset, TH)
		expect(r.fire).toBe(80)
		expect(r.next).toStrictEqual({ lastBucket: 80, resetsAt: reset })
	})

	it('does not re-fire the same bucket on the next cycle', () => {
		const prev = { lastBucket: 80, resetsAt: reset }
		const r = evaluateWindow(prev, 85, reset, TH)
		expect(r.fire).toBeNull()
		expect(r.next.lastBucket).toBe(80)
	})

	it('treats millisecond jitter in resetsAt as the same window', () => {
		// oauth/usage answers 12:00:00.030Z, then 12:00:00.020Z for one window.
		const prev = { lastBucket: 80, resetsAt: '2026-10-12T12:00:00.030Z' }
		const r = evaluateWindow(prev, 89.7, '2026-10-12T12:00:00.020Z', TH)
		expect(r.fire).toBeNull()
		expect(r.next).toStrictEqual(prev)
	})

	it('escalates to a higher threshold once crossed', () => {
		const prev = { lastBucket: 80, resetsAt: reset }
		const r = evaluateWindow(prev, 96, reset, TH)
		expect(r.fire).toBe(95)
		expect(r.next.lastBucket).toBe(95)
	})

	it('re-arms after a window rollover (resetsAt changes)', () => {
		const prev = { lastBucket: 95, resetsAt: reset }
		const newReset = '2026-06-23T17:00:00Z'
		const r = evaluateWindow(prev, 81, newReset, TH)
		expect(r.fire).toBe(80)
		expect(r.next).toStrictEqual({ lastBucket: 80, resetsAt: newReset })
	})

	it('does not fire below the lowest threshold', () => {
		const r = evaluateWindow(undefined, 50, reset, TH)
		expect(r.fire).toBeNull()
		expect(r.next.lastBucket).toBe(0)
	})

	it('lowers the high-water mark when pct drops within the same window', () => {
		const prev = { lastBucket: 95, resetsAt: reset }
		const r = evaluateWindow(prev, 70, reset, TH)
		expect(r.fire).toBeNull()
		expect(r.next.lastBucket).toBe(0)
		// a later re-cross then notifies again
		const again = evaluateWindow(r.next, 82, reset, TH)
		expect(again.fire).toBe(80)
	})

	it('does not re-alert when pct wobbles across a threshold', () => {
		// A group slice is derived, so 99.0 / 99.2 / 99.0 / 99.2 can be one steady climb.
		const th = NOTIFY_MODES.critical
		let state = evaluateWindow(undefined, 99.2, reset, th)
		expect(state.fire).toBe(99.2)
		const fired: (number | null)[] = []
		for (const pct of [99, 99.2, 99, 99.2, 98.6, 99.2]) {
			state = evaluateWindow(state.next, pct, reset, th)
			fired.push(state.fire)
		}
		expect(fired).toStrictEqual([null, null, null, null, null, null])
	})

	it('still climbs through the 99.x tail one step at a time', () => {
		const th = NOTIFY_MODES.critical
		const fired: (number | null)[] = []
		let state = evaluateWindow(undefined, 98.5, reset, th)
		for (const pct of [99, 99.05, 99.1, 99.34, 99.9, 100]) {
			state = evaluateWindow(state.next, pct, reset, th)
			fired.push(state.fire)
		}
		expect(fired).toStrictEqual([99, null, 99.1, 99.3, 99.9, 100])
	})

	it('keeps the mark and tracks the window when pct is null', () => {
		const prev = { lastBucket: 80, resetsAt: reset }
		const r = evaluateWindow(prev, null, reset, TH)
		expect(r.fire).toBeNull()
		expect(r.next).toStrictEqual({ lastBucket: 80, resetsAt: reset })
	})
})
