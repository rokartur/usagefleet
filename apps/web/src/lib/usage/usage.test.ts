import { describe, expect, it } from 'vitest'
import { foldEvents, recordTotal } from './fold'
import { modelBreakdown, modelLabel } from './models'
import { costForTokens, costUsd, priceFor } from './pricing'
import type { TokenTotals, UsageRecord } from './types'
import { pastWindowStarts, weekWindowStart } from './window'

// `ts` is omitted before the intersection: Partial<UsageRecord> contributes
// `ts?: Date`, and intersecting that with `ts: string` yields `Date & string`,
// which no literal can satisfy.
function rec(p: Partial<Omit<UsageRecord, 'ts'>> & { uuid: string; ts: string }): UsageRecord {
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

// One logical message (msg_1/req_1) streamed across 3 segments with growing
// totals — must collapse to the largest, NOT sum.
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
const m2 = rec({
	cacheReadTokens: 1000,
	groupId: 'g2',
	inputTokens: 10,
	messageId: 'msg_2',
	outputTokens: 50,
	requestId: 'req_2',
	ts: '2026-06-18T10:20:00Z',
	uuid: 'u2',
})
const NOW = new Date('2026-06-18T12:30:00Z')

describe('fold', () => {
	it('keeps only the largest segment per (messageId, requestId)', () => {
		const folded = foldEvents(m1)
		expect(folded).toHaveLength(1)
		expect(folded[0].uuid).toBe('u1c')
		expect(recordTotal(folded[0])).toBe(6 + 312 + 13_240 + 17_499) // 31057
	})

	it('folds lines without a messageId by uuid', () => {
		const a = rec({ outputTokens: 5, ts: '2026-06-18T10:00:00Z', uuid: 'x' })
		const b = rec({ outputTokens: 7, ts: '2026-06-18T10:00:00Z', uuid: 'y' })
		expect(foldEvents([a, b])).toHaveLength(2)
	})
})

describe('weekly window', () => {
	it('finds the most recent reset (Monday)', () => {
		expect(weekWindowStart(NOW, 1, 0).toISOString()).toBe('2026-06-15T00:00:00.000Z')
	})

	it("walks back when this week's reset is still in the future (Friday)", () => {
		// NOW is Thursday 06-18; this week's Friday (06-19) is future → previous Friday 06-12
		expect(weekWindowStart(NOW, 5, 0).toISOString()).toBe('2026-06-12T00:00:00.000Z')
	})
})

describe('past windows', () => {
	const FIVE_H = 5 * 60 * 60 * 1000
	// NOW is 2026-06-18T12:00:00Z; the reported reset sits in the future, so the
	// open window is 10:00–15:00 and the completed ones run backwards from 10:00.
	const starts = pastWindowStarts(new Date('2026-06-18T15:00:00Z'), FIVE_H, NOW, 3)

	it('walks back from the window containing now, newest first', () => {
		expect(starts.map(d => d.toISOString())).toStrictEqual([
			'2026-06-18T05:00:00.000Z',
			'2026-06-18T00:00:00.000Z',
			'2026-06-17T19:00:00.000Z',
		])
	})

	it('takes its phase from the origin, past or future', () => {
		// 06-01T00:00 is exactly 84 strides before NOW, so the open window starts at
		// 12:00 and the last completed one at 07:00 — a different grid than above.
		const [first] = pastWindowStarts(new Date('2026-06-01T00:00:00Z'), FIVE_H, NOW, 1)
		expect(first?.toISOString()).toBe('2026-06-18T07:00:00.000Z')
	})
})

describe('pricing', () => {
	it('prices per million tokens by model family and version', () => {
		const mtok = (over: Partial<TokenTotals>): TokenTotals => ({
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			...over,
		})
		// Opus 4.5+ current tier: $5 in / $25 out per MTok.
		expect(costForTokens(mtok({ inputTokens: 1_000_000 }), 'claude-opus-4-8')).toBeCloseTo(5)
		expect(costForTokens(mtok({ outputTokens: 1_000_000 }), 'claude-opus-4-8')).toBeCloseTo(25)
		// Opus 4.1 legacy tier: $15 in / $75 out per MTok.
		expect(costForTokens(mtok({ inputTokens: 1_000_000 }), 'claude-opus-4-1')).toBeCloseTo(15)
		expect(costForTokens(mtok({ outputTokens: 1_000_000 }), 'claude-opus-4-1')).toBeCloseTo(75)
		// Haiku 4.5 ($1/$5) vs Haiku 3.5 legacy ($0.80/$4).
		expect(costForTokens(mtok({ inputTokens: 1_000_000 }), 'claude-haiku-4-5')).toBeCloseTo(1)
		expect(costForTokens(mtok({ inputTokens: 1_000_000 }), 'claude-3-5-haiku')).toBeCloseTo(0.8)
		// Sonnet flat $3 in / $15 out; cache read 0.1x. Cache writes default to the
		// 5m rate (1.25x) because that is what Claude Code writes unless
		// ENABLE_PROMPT_CACHING_1H is set; 1h is 2x.
		expect(costForTokens(mtok({ inputTokens: 1_000_000 }), 'claude-sonnet-4-6')).toBeCloseTo(3)
		expect(costForTokens(mtok({ cacheCreationTokens: 1_000_000 }), 'claude-sonnet-4-6')).toBeCloseTo(3.75)
		expect(costForTokens(mtok({ cacheCreationTokens: 1_000_000 }), 'claude-sonnet-4-6', '1h')).toBeCloseTo(6)
		expect(costForTokens(mtok({ cacheReadTokens: 1_000_000 }), 'claude-sonnet-4-6')).toBeCloseTo(0.3)
	})

	it('prices fable at the frontier tier ($10/$50, cache 20/1)', () => {
		expect(priceFor('claude-fable-5')).toStrictEqual({
			cacheRead: 1,
			cacheWrite: 20,
			input: 10,
			output: 50,
		})
		expect(
			costUsd(
				rec({
					model: 'claude-fable-5',
					outputTokens: 1_000_000,
					ts: '2026-06-18T10:00:00Z',
					uuid: 'f',
				}),
			),
		).toBeCloseTo(50)
	})
})

describe('model breakdown', () => {
	it('labels model families with a major.minor version', () => {
		expect(modelLabel('claude-opus-4-8-20251101')).toBe('Opus 4.8')
		// Single-number versions and the "[1m]" / dated-snapshot suffixes.
		expect(modelLabel('claude-opus-5')).toBe('Opus 5')
		expect(modelLabel('claude-opus-5[1m]')).toBe('Opus 5')
		expect(modelLabel('claude-opus-5-20260601')).toBe('Opus 5')
		expect(modelLabel('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
		expect(modelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6')
		expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
		expect(modelLabel(null)).toBe('Unknown')
		expect(modelLabel('gpt-4o')).toBe('gpt-4o') // unknown family → raw id kept
	})

	it('folds streamed segments, groups by model, sorts by billable desc', () => {
		const opus = rec({
			inputTokens: 100,
			messageId: 'mo',
			model: 'claude-opus-4-8',
			outputTokens: 900,
			requestId: 'ro',
			ts: '2026-06-18T10:30:00Z',
			uuid: 'o1',
		})
		const mb = modelBreakdown([...m1, m2, opus])
		// sonnet billable (13558 from folded m1 + 60 from m2) > opus (1000) → first
		expect(mb.map(m => m.label)).toStrictEqual(['Sonnet 4.6', 'Opus 4.8'])
		const sonnet = mb.find(m => m.label === 'Sonnet 4.6')!
		expect(sonnet.billableTokens).toBe(13_558 + 60)
		expect(sonnet.totals.totalTokens).toBe(31_057 + 1060) // folded, not 3x m1
		expect(mb.find(m => m.label === 'Opus 4.8')!.billableTokens).toBe(1000)
	})

	it('drops token-less pseudo-models like <synthetic>', () => {
		const real = rec({
			model: 'claude-opus-4-8',
			outputTokens: 100,
			ts: '2026-06-18T10:00:00Z',
			uuid: 'r1',
		})
		const synthetic = rec({
			model: '<synthetic>',
			ts: '2026-06-18T10:01:00Z',
			uuid: 's1',
		}) // all token buckets 0
		const mb = modelBreakdown([real, synthetic])
		expect(mb.map(m => m.label)).toStrictEqual(['Opus 4.8']) // <synthetic> excluded
	})

	it("buckets events without a model id under 'unknown'", () => {
		const noModel = rec({
			model: null,
			outputTokens: 5,
			ts: '2026-06-18T10:00:00Z',
			uuid: 'n1',
		})
		const mb = modelBreakdown([noModel])
		expect(mb).toHaveLength(1)
		expect(mb[0].model).toBe('unknown')
		expect(mb[0].label).toBe('Unknown')
	})
})
