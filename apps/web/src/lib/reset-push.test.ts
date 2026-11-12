import { describe, expect, it } from 'vitest'
import { isPushEndpoint, resetDue } from './reset-push'

describe(isPushEndpoint, () => {
	it('takes the push services browsers use', () => {
		expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc:def')).toBeTruthy()
		expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBeTruthy()
		expect(isPushEndpoint('https://web.push.apple.com/QAbc')).toBeTruthy()
		expect(isPushEndpoint('https://wns2-db5p.notify.windows.com/w/?token=abc')).toBeTruthy()
	})

	it('refuses anything that could point the server elsewhere', () => {
		const hostile = [
			'http://fcm.googleapis.com/fcm/send/abc',
			'https://fcm.googleapis.com:8443/fcm/send/abc',
			'https://user@fcm.googleapis.com/fcm/send/abc',
			'https://fcm.googleapis.com.evil.test/x',
			'https://evilnotify.windows.com/x',
			'https://169.254.169.254/latest/meta-data',
			'https://localhost/x',
			'not a url',
		]
		expect(hostile.filter(isPushEndpoint)).toStrictEqual([])
	})
})

describe(resetDue, () => {
	const windowStart = new Date('2026-06-23T12:00:00Z')
	const resetAt = Date.parse('2026-06-23T17:00:00Z')
	const at = (ms: number) => new Date(resetAt + ms)

	it('is due a few minutes after the reset, once the snapping slack has passed', () => {
		expect(resetDue({ peakPct: 92, window: '5h', windowStart }, at(0))).toBeFalsy()
		expect(resetDue({ peakPct: 92, window: '5h', windowStart }, at(3 * 60_000))).toBeTruthy()
	})

	it('skips windows that stayed under the threshold or ended long ago', () => {
		expect(resetDue({ peakPct: 40, window: '5h', windowStart }, at(3 * 60_000))).toBeFalsy()
		expect(resetDue({ peakPct: 92, window: '5h', windowStart }, at(60 * 60_000))).toBeFalsy()
	})

	it('reads the weekly window as seven days', () => {
		expect(resetDue({ peakPct: 92, window: '7d', windowStart }, at(3 * 60_000))).toBeFalsy()
		const weekLater = new Date(windowStart.getTime() + 7 * 24 * 3_600_000 + 3 * 60_000)
		expect(resetDue({ peakPct: 92, window: '7d', windowStart }, weekLater)).toBeTruthy()
	})
})
