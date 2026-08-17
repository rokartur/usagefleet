import { describe, expect, it } from 'vitest'
import { resolveClockOffset } from './clock'

const RECEIVED = Date.parse('2026-06-18T12:00:00Z')
const NONE = { at: null, ms: null }
const at = (iso: string) => new Date(iso)

describe(resolveClockOffset, () => {
	it('measures drift in both directions on a first upload', () => {
		expect(
			resolveClockOffset({ receivedAt: RECEIVED, sentAt: '2026-06-18T11:58:00Z', stored: NONE }),
		).toStrictEqual({
			at: new Date(RECEIVED),
			ms: 120_000,
		})
		expect(resolveClockOffset({ receivedAt: RECEIVED, sentAt: '2026-06-18T12:02:00Z', stored: NONE })?.ms).toBe(
			-120_000,
		)
	})

	it('keeps the lower reading within a window, so retry backoff falls away', () => {
		// Same clock, one upload delayed by three minutes of retries. The inflated
		// reading must not become the correction.
		const stored = { at: at('2026-06-18T11:30:00Z'), ms: 2000 }
		const retried = resolveClockOffset({ receivedAt: RECEIVED, sentAt: '2026-06-18T11:57:00Z', stored })
		expect(retried).toStrictEqual({ at: stored.at, ms: 2000 })

		const cleaner = resolveClockOffset({ receivedAt: RECEIVED, sentAt: '2026-06-18T11:59:59.500Z', stored })
		expect(cleaner).toStrictEqual({ at: stored.at, ms: 500 })
	})

	it('re-arms once the window ages out, so a corrected clock stops being followed by a stale offset', () => {
		// The minimum can only fall inside a window, so a machine that ran ahead and
		// was then stepped back keeps the old negative offset until the re-arm. That
		// is the ceiling OFFSET_WINDOW_MS bounds, so pin both sides of it.
		const ahead = { at: at('2026-06-18T11:30:00Z'), ms: -1_200_000 }
		expect(resolveClockOffset({ receivedAt: RECEIVED, sentAt: '2026-06-18T12:00:00Z', stored: ahead })?.ms).toBe(
			-1_200_000,
		)

		const stale = { at: at('2026-06-18T10:30:00Z'), ms: -1_200_000 }
		expect(
			resolveClockOffset({ receivedAt: RECEIVED, sentAt: '2026-06-18T12:00:00Z', stored: stale }),
		).toStrictEqual({
			at: new Date(RECEIVED),
			ms: 0,
		})
	})

	it('holds the stored offset when a reading is unusable', () => {
		// Collector too old to send it, junk, and a stopped RTC: all unknown, none
		// of them a measured zero.
		const stored = { at: at('2026-06-18T09:00:00Z'), ms: 2000 }
		for (const sentAt of [undefined, 'not a date', '1970-01-01T00:00:00Z']) {
			expect(resolveClockOffset({ receivedAt: RECEIVED, sentAt, stored })).toStrictEqual(stored)
			expect(resolveClockOffset({ receivedAt: RECEIVED, sentAt, stored: NONE })).toBeNull()
		}
	})
})
