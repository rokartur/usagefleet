import { describe, expect, it } from 'vitest'
import { bucketKeys, bucketLabel, daySpan } from './chart'

describe('chart bucketing', () => {
	it('fills every day in range, including across a month boundary', () => {
		expect(bucketKeys('2026-06-29', '2026-07-02', false)).toStrictEqual([
			'2026-06-29',
			'2026-06-30',
			'2026-07-01',
			'2026-07-02',
		])
		expect(bucketKeys('2026-06-29', '2026-06-29', false)).toStrictEqual(['2026-06-29'])
	})

	it('fills every month in range, rolling over the year', () => {
		expect(bucketKeys('2026-11-14', '2027-02-03', true)).toStrictEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
	})

	it('day span is inclusive', () => {
		expect(daySpan('2026-06-01', '2026-06-01')).toBe(1)
		expect(daySpan('2026-06-01', '2026-06-30')).toBe(30)
	})

	it('labels days and months distinctly', () => {
		expect(bucketLabel('2026-06-08')).toBe('Jun 8')
		expect(bucketLabel('2026-06')).toBe('Jun 26')
	})
})
