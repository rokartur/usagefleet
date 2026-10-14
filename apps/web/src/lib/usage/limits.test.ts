import { describe, expect, it } from 'vitest'
import { projectSession, reportedWindows, sameReset } from '@/lib/usage/limits'

// oauth/usage stamps every window of one response with the same sub-second jitter,
// but a window it dropped keeps an older reading's stamp: 11:59:59.668 vs 12:00:00.440.
describe(sameReset, () => {
	it('treats jitter around one reset as the same reset', () => {
		expect(sameReset('2026-10-12T12:00:00.440Z', '2026-10-12T11:59:59.668Z')).toBeTruthy()
	})

	it('tells apart resets that are not the same window', () => {
		expect(sameReset('2026-10-12T12:00:00.000Z', '2026-10-13T12:00:00.000Z')).toBeFalsy()
		expect(sameReset('2026-10-12T12:00:00.000Z', null)).toBeFalsy()
		expect(sameReset(null, null)).toBeTruthy()
	})
})

describe(reportedWindows, () => {
	it('writes the windows a report carried', () => {
		expect(
			reportedWindows({
				fiveHourPct: 12.5,
				fiveHourResetsAt: '2024-01-01T05:00:00.000Z',
				sevenDayPct: 60,
				sevenDayResetsAt: '2024-01-04T00:00:00.000Z',
			}),
		).toStrictEqual({
			fiveHourPct: 12.5,
			fiveHourResetsAt: new Date('2024-01-01T05:00:00.000Z'),
			sevenDayPct: 60,
			sevenDayResetsAt: new Date('2024-01-04T00:00:00.000Z'),
		})
	})

	// A missing window must leave the stored value alone: writing null reads as
	// 0% on the dashboard for the whole cycle until the next report.
	it('leaves a window out entirely when the report has no reading for it', () => {
		expect(reportedWindows({ fiveHourPct: 12.5, fiveHourResetsAt: null, sevenDayPct: null })).toStrictEqual({
			fiveHourPct: 12.5,
			fiveHourResetsAt: null,
		})
		expect(reportedWindows({})).toStrictEqual({})
	})

	it('keeps a zero reading, which is a real reading', () => {
		expect(reportedWindows({ fiveHourPct: 0 })).toStrictEqual({ fiveHourPct: 0, fiveHourResetsAt: null })
	})
})

describe(projectSession, () => {
	const start = new Date('2026-10-14T10:00:00Z')
	const reset = new Date('2026-10-14T15:00:00Z')
	const at = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00Z`)
	const rises = [
		{ at: at('10:20'), pct: 10 },
		{ at: at('11:00'), pct: 20 },
		{ at: at('11:40'), pct: 40 },
	]

	it('runs the last hour pace to the reset and says when it hits 100%', () => {
		// 20% at 11:00, 50% at 12:00: 30 points an hour, so the other 50 take 1h40m.
		expect(projectSession(rises, 50, start, reset, at('12:00'))).toStrictEqual({ fullAt: at('13:40'), pct: 100 })
	})

	it('projects a pace that lasts past the reset without a time', () => {
		// 40% at 11:40 still stands at 12:40; 10 points an hour for the 2h20m left.
		expect(projectSession(rises, 50, start, reset, at('12:40'))?.pct).toBeCloseTo(50 + 10 * (7 / 3))
		expect(projectSession(rises, 50, start, reset, at('12:40'))?.fullAt).toBeNull()
	})

	it('counts from 0% at the window start while the window is younger than an hour', () => {
		// 15 points in the first 30 minutes: 30 an hour, so the other 85 take 2h50m.
		expect(projectSession([], 15, start, reset, at('10:30'))?.fullAt).toStrictEqual(at('13:20'))
	})

	it('stays quiet in the first half hour, with no rise in the last hour, or past the limit', () => {
		expect(projectSession([], 10, start, reset, at('10:20'))).toBeNull()
		expect(projectSession(rises, 40, start, reset, at('13:00'))).toBeNull()
		expect(projectSession(rises, 100, start, reset, at('12:00'))).toBeNull()
	})
})
