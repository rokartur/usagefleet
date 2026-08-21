import { describe, expect, it } from 'vitest'
import { evaluateWindow, loadNotifyConfig } from './notifier.js'

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

	it('drops out-of-range / non-numeric entries and falls back when empty', () => {
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY_THRESHOLDS: '0,101,-5,abc' }, {}).thresholds).toStrictEqual([
			80, 95,
		])
		expect(loadNotifyConfig({ USAGEFLEET_NOTIFY_THRESHOLDS: '  ' }, {}).thresholds).toStrictEqual([80, 95])
		expect(loadNotifyConfig({}, { notifyThresholds: [0, 200] }).thresholds).toStrictEqual([80, 95])
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

	it('keeps the mark and tracks the window when pct is null', () => {
		const prev = { lastBucket: 80, resetsAt: reset }
		const r = evaluateWindow(prev, null, reset, TH)
		expect(r.fire).toBeNull()
		expect(r.next).toStrictEqual({ lastBucket: 80, resetsAt: reset })
	})
})
