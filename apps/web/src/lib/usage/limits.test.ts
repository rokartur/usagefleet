import { describe, expect, it } from 'vitest'
import { reportedWindows, sameReset } from '@/lib/usage/limits'

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
