import { describe, expect, it } from 'vitest'
import { monthKey } from './daily-agg'
import type { DailyAggRow } from './daily-agg'
import { sumTokens } from './fold'
import { EMPTY_TOTALS } from './types'

function row(p: Partial<DailyAggRow> & { day: string }): DailyAggRow {
	return {
		cacheCreationTokens: 0,
		cacheReadTokens: 0,
		deviceId: 'dev1',
		groupId: null,
		inputTokens: 0,
		model: 'claude-sonnet-4-6',
		outputTokens: 0,
		source: 'cli',
		...p,
	}
}

const ROWS: DailyAggRow[] = [
	row({
		cacheCreationTokens: 2,
		cacheReadTokens: 100,
		day: '2026-06-24',
		groupId: 'g1',
		inputTokens: 10,
		model: 'claude-opus-4-8',
		outputTokens: 5,
	}),
	row({
		cacheReadTokens: 40,
		day: '2026-06-24',
		groupId: 'g2',
		inputTokens: 3,
		outputTokens: 1,
	}),
	row({
		cacheReadTokens: 7,
		day: '2026-06-18',
		groupId: 'g1',
		model: 'claude-opus-4-8',
		outputTokens: 20,
	}),
	row({ day: '2026-05-30', groupId: 'g1', inputTokens: 8 }),
]

describe('daily-agg', () => {
	it('keys months in UTC, not the local zone', () => {
		// 23:30Z is already the next day in UTC+2; the month must not follow it.
		expect(monthKey(new Date('2026-06-30T23:30:00Z'))).toBe('2026-06')
	})

	it('sumTokens totals every component and the grand total', () => {
		const t = sumTokens(ROWS)
		expect(t.inputTokens).toBe(21) // 10 + 3 + 8
		expect(t.outputTokens).toBe(26) // 5 + 1 + 20
		expect(t.cacheCreationTokens).toBe(2)
		expect(t.cacheReadTokens).toBe(147) // 100 + 40 + 7
		expect(t.totalTokens).toBe(21 + 26 + 2 + 147)
	})

	it('starts from zero per call rather than mutating the shared EMPTY_TOTALS', () => {
		sumTokens(ROWS)
		expect(EMPTY_TOTALS).toStrictEqual({
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		})
		expect(sumTokens([]).totalTokens).toBe(0)
	})
})
