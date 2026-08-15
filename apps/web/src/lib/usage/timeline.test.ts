import { describe, expect, it } from 'vitest'
import { buildDailyTimeline, buildHourlyTimeline, buildTimeline, metricValue } from './timeline'
import type { UsageRecord } from './types'

/** Billable shorthand for the new TokenTotals-keyed buckets. */
const bill = (t: {
	inputTokens: number
	outputTokens: number
	cacheCreationTokens: number
	cacheReadTokens: number
	totalTokens: number
}) => metricValue(t, 'billable')

function rec(p: Partial<UsageRecord> & { uuid: string; ts: string }): UsageRecord {
	return {
		messageId: null,
		requestId: null,
		model: 'claude-sonnet-4-6',
		inputTokens: 0,
		outputTokens: 0,
		cacheCreationTokens: 0,
		cacheReadTokens: 0,
		groupId: null,
		deviceId: null,
		...p,
		ts: new Date(p.ts),
	}
}

// One logical message streamed across 3 growing segments — must fold to the
// largest BEFORE bucketing (else a single message is counted 3x).
const m1 = [
	rec({
		cacheCreationTokens: 13_240,
		cacheReadTokens: 17_499,
		groupId: 'g1',
		inputTokens: 6,
		messageId: 'msg_1',
		outputTokens: 100,
		requestId: 'req_1',
		ts: '2026-06-18T10:15:00Z',
		uuid: 'u1a',
	}),
	rec({
		cacheCreationTokens: 13_240,
		cacheReadTokens: 17_499,
		groupId: 'g1',
		inputTokens: 6,
		messageId: 'msg_1',
		outputTokens: 200,
		requestId: 'req_1',
		ts: '2026-06-18T10:15:01Z',
		uuid: 'u1b',
	}),
	rec({
		cacheCreationTokens: 13_240,
		cacheReadTokens: 17_499,
		groupId: 'g1',
		inputTokens: 6,
		messageId: 'msg_1',
		outputTokens: 312,
		requestId: 'req_1',
		ts: '2026-06-18T10:15:02Z',
		uuid: 'u1c',
	}),
]

const WEEK_START = new Date('2026-06-15T00:00:00Z')
const NOW = new Date('2026-06-18T12:30:00Z')

describe('timeline — daily', () => {
	it('buckets events into their UTC day, dense and time-ascending', () => {
		const evs = [
			rec({ outputTokens: 10, ts: '2026-06-16T09:00:00Z', uuid: 'a' }),
			rec({ outputTokens: 25, ts: '2026-06-18T11:00:00Z', uuid: 'b' }),
		]
		const tl = buildDailyTimeline(evs, WEEK_START, NOW)
		// 06-15, 06-16, 06-17, 06-18 → 4 dense buckets
		expect(tl.map(b => b.ts)).toStrictEqual([
			'2026-06-15T00:00:00.000Z',
			'2026-06-16T00:00:00.000Z',
			'2026-06-17T00:00:00.000Z',
			'2026-06-18T00:00:00.000Z',
		])
		expect(tl.map(b => bill(b.totals))).toStrictEqual([0, 10, 0, 25])
		expect(tl[1].label).toBe('Jun 16')
	})

	it('folds streamed segments before bucketing (largest, not sum)', () => {
		const tl = buildDailyTimeline(m1, WEEK_START, NOW)
		const day = tl.find(b => b.ts === '2026-06-18T00:00:00.000Z')!
		// billable of the largest segment = 6 + 312 + 13240 = 13558 (NOT 3x)
		expect(bill(day.totals)).toBe(13_558)
		expect(bill(day.byGroup.g1)).toBe(13_558)
	})

	it('billable metric excludes cache reads; cacheRead/total metrics include them', () => {
		const evs = [
			rec({
				cacheCreationTokens: 3,
				cacheReadTokens: 99_999,
				inputTokens: 5,
				outputTokens: 7,
				ts: '2026-06-17T08:00:00Z',
				uuid: 'x',
			}),
			rec({ cacheReadTokens: 50_000, ts: '2026-06-17T09:00:00Z', uuid: 'y' }), // pure cache read
		]
		const tl = buildDailyTimeline(evs, WEEK_START, NOW)
		const day = tl.find(b => b.ts === '2026-06-17T00:00:00.000Z')!
		expect(metricValue(day.totals, 'billable')).toBe(15) // 5 + 7 + 3, cacheRead excluded
		expect(metricValue(day.totals, 'cacheRead')).toBe(149_999) // both rows' cache reads
		expect(metricValue(day.totals, 'total')).toBe(150_014) // billable + cache reads
		expect(metricValue(day.totals, 'input')).toBe(5)
		expect(metricValue(day.totals, 'output')).toBe(7)
		// The pure-cache row keeps the same model key — it counts toward cache metrics.
		expect(Object.keys(day.byModel)).toStrictEqual(['claude-sonnet-4-6'])
		expect(metricValue(day.byModel['claude-sonnet-4-6'], 'billable')).toBe(15)
	})

	it('drops truly-empty (<synthetic>) rows with 0 of every token', () => {
		const evs = [
			rec({
				model: 'claude-opus-4-8',
				outputTokens: 9,
				ts: '2026-06-16T08:00:00Z',
				uuid: 'real',
			}),
			rec({ model: '<synthetic>', ts: '2026-06-16T09:00:00Z', uuid: 'synth' }), // all zero
		]
		const day = buildDailyTimeline(evs, WEEK_START, NOW).find(b => b.ts === '2026-06-16T00:00:00.000Z')!
		expect(Object.keys(day.byModel)).toStrictEqual(['claude-opus-4-8'])
		expect(metricValue(day.totals, 'total')).toBe(9)
	})

	it('excludes events outside the window', () => {
		const evs = [
			rec({ outputTokens: 100, ts: '2026-06-10T08:00:00Z', uuid: 'before' }),
			rec({ outputTokens: 5, ts: '2026-06-16T08:00:00Z', uuid: 'in' }),
			rec({ outputTokens: 100, ts: '2026-06-20T08:00:00Z', uuid: 'after' }),
		]
		const tl = buildDailyTimeline(evs, WEEK_START, NOW)
		expect(tl.reduce((s, b) => s + bill(b.totals), 0)).toBe(5)
	})

	it('keys byGroup/byModel correctly and group sums equal the bucket total', () => {
		const evs = [
			rec({
				groupId: 'g1',
				model: 'claude-opus-4-8',
				outputTokens: 10,
				ts: '2026-06-16T08:00:00Z',
				uuid: 'a',
			}),
			rec({
				groupId: null,
				model: 'claude-sonnet-4-6',
				outputTokens: 4,
				ts: '2026-06-16T09:00:00Z',
				uuid: 'b',
			}),
		]
		const day = buildDailyTimeline(evs, WEEK_START, NOW).find(b => b.ts === '2026-06-16T00:00:00.000Z')!
		expect(bill(day.totals)).toBe(14)
		expect(bill(day.byGroup.g1)).toBe(10)
		expect(bill(day.byGroup.ungrouped)).toBe(4)
		expect(bill(day.byModel['claude-opus-4-8'])).toBe(10)
		expect(bill(day.byModel['claude-sonnet-4-6'])).toBe(4)
		const groupSum = Object.values(day.byGroup).reduce((s, t) => s + bill(t), 0)
		expect(groupSum).toBe(bill(day.totals))
		// cells carry the full (group × model × source × device) split; absent
		// source/device fall back to "cli"/"unknown" and the cell sum == the total.
		expect(day.cells).toHaveLength(2)
		const g1cell = day.cells.find(c => c.g === 'g1')!
		expect([g1cell.m, g1cell.s, g1cell.d, bill(g1cell.totals)]).toStrictEqual([
			'claude-opus-4-8',
			'cli',
			'unknown',
			10,
		])
		const cellSum = day.cells.reduce((s, c) => s + bill(c.totals), 0)
		expect(cellSum).toBe(bill(day.totals))
	})

	it('is deterministic — identical inputs produce deep-equal output', () => {
		const a = buildDailyTimeline(m1, WEEK_START, NOW)
		const b = buildDailyTimeline(m1, WEEK_START, NOW)
		expect(a).toStrictEqual(b)
	})
})

describe('timeline — hourly', () => {
	it('buckets by UTC hour with HH:00 labels', () => {
		const start = new Date('2026-06-18T10:00:00Z')
		const end = new Date('2026-06-18T12:30:00Z')
		const evs = [
			rec({ outputTokens: 3, ts: '2026-06-18T10:30:00Z', uuid: 'a' }),
			rec({ outputTokens: 8, ts: '2026-06-18T12:05:00Z', uuid: 'b' }),
		]
		const tl = buildHourlyTimeline(evs, start, end)
		expect(tl.map(b => b.label)).toStrictEqual(['10:00', '11:00', '12:00'])
		expect(tl.map(b => bill(b.totals))).toStrictEqual([3, 0, 8])
	})
})

describe('timeline — buildTimeline dispatch', () => {
	it('routes granularity to day/hour bucketing', () => {
		const evs = [rec({ outputTokens: 5, ts: '2026-06-16T08:00:00Z', uuid: 'a' })]
		expect(buildTimeline(evs, WEEK_START, NOW, 'day')).toHaveLength(4)
		const hStart = new Date('2026-06-16T08:00:00Z')
		const hEnd = new Date('2026-06-16T10:00:00Z')
		expect(buildTimeline(evs, hStart, hEnd, 'hour')).toHaveLength(3)
	})
})
