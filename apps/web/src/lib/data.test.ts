import { describe, expect, it } from 'vitest'
import { buildPastWindows, groupBudgetPct, splitByShare } from './data'
import type { WindowAggRow } from './data'
import type { UsageRecord } from './usage'

const STRIDE = 5 * 60 * 60 * 1000
const START = new Date('2026-06-18T10:00:00Z')

const cell = (groupId: string | null, model: string, billable: number): WindowAggRow => ({
	binStart: START.getTime(),
	groupId,
	model,
	totals: {
		cacheCreationTokens: 0,
		cacheReadTokens: 0,
		inputTokens: billable,
		outputTokens: 0,
		totalTokens: billable,
	},
})

const label = (id: string | null) => ({
	color: '#fff',
	name: id ?? 'Ungrouped',
})
const build = (rows: WindowAggRow[], peaks: Map<number, number>) =>
	buildPastWindows(rows, [START], STRIDE, peaks, '1h', label)

describe(buildPastWindows, () => {
	it("splits the window's reported utilization across groups by cost share", () => {
		// Same token count, but opus costs 5x sonnet — so it eats 5/6 of the 60%.
		const [w] = build(
			[cell('a', 'claude-opus-4', 1_000_000), cell('b', 'claude-sonnet-4', 1_000_000)],
			new Map([[START.getTime(), 60]]),
		)
		expect(w.accountPct).toBe(60)
		expect(w.groups).toStrictEqual([
			{
				accountPct: 50,
				color: '#fff',
				groupId: 'a',
				name: 'a',
				tokens: 1_000_000,
			},
			{
				accountPct: 10,
				color: '#fff',
				groupId: 'b',
				name: 'b',
				tokens: 1_000_000,
			},
		])
	})

	it('reports tokens without a percentage when no sample covers the window', () => {
		const [w] = build([cell('a', 'claude-sonnet-4', 500_000)], new Map())
		expect(w.accountPct).toBeNull()
		expect(w.groups[0]).toMatchObject({ accountPct: null, tokens: 500_000 })
	})

	it('drops windows with no activity', () => {
		expect(build([], new Map([[START.getTime(), 40]]))).toStrictEqual([])
	})
})

const WIN_START = new Date('2026-06-18T10:00:00Z')
const NOW = new Date('2026-06-18T14:00:00Z')

let seq = 0
/** One folded message: `at` defaults inside the window, tokens are all input so
 *  cost tracks the model's input price. */
const ev = (groupId: string | null, model: string, inputTokens: number, at = new Date('2026-06-18T12:00:00Z')) => {
	seq += 1
	return {
		cacheCreationTokens: 0,
		cacheReadTokens: 0,
		groupId,
		inputTokens,
		messageId: `m${seq}`,
		model,
		outputTokens: 0,
		requestId: null,
		ts: at,
		uuid: `u${seq}`,
	} satisfies UsageRecord
}

const split = (events: UsageRecord[], officialPct: number) => splitByShare(events, WIN_START, NOW, officialPct, '5m')

describe(splitByShare, () => {
	it('weighs each group by cost, not by token count', () => {
		// Same tokens, but opus input costs 5x sonnet — so it takes 5/6 of the 60%.
		const s = split([ev('a', 'claude-opus-4', 1_000_000), ev('b', 'claude-sonnet-4', 1_000_000)], 60)
		expect(s.get('a')?.exactPct).toBeCloseTo(50, 6)
		expect(s.get('b')?.exactPct).toBeCloseTo(10, 6)
	})

	it('gives the whole account percentage to a lone group', () => {
		const s = split([ev('a', 'claude-sonnet-4', 1_000_000)], 73)
		expect(s.get('a')?.exactPct).toBeCloseTo(73, 6)
		// One group holding the whole account reads 100% of its own budget slice.
		expect(groupBudgetPct(s.get('a'), 1)).toBe(73)
	})

	it("lets a group exceed 100% of its slice when it eats another's", () => {
		// 'a' spends 3x 'b', so with two groups it is well past its half.
		const s = split([ev('a', 'claude-sonnet-4', 3_000_000), ev('b', 'claude-sonnet-4', 1_000_000)], 80)
		expect(groupBudgetPct(s.get('a'), 2)).toBe(120)
		expect(groupBudgetPct(s.get('b'), 2)).toBe(40)
	})

	it('keeps exactPct unrounded so the budget scale rounds only once', () => {
		// 1% across 10 equal groups is 0.1 each; rounding here would floor it to 0
		// and the whole dashboard would read 0% instead of 1%.
		const events = Array.from({ length: 10 }, (_, i) => ev(`g${i}`, 'claude-sonnet-4', 1_000_000))
		const s = split(events, 1)
		expect(s.get('g0')?.exactPct).toBeCloseTo(0.1, 6)
		expect(groupBudgetPct(s.get('g0'), 10)).toBe(1)
	})

	it('reports zero share when the window has usage but no priceable cost', () => {
		// A zero-token message has no cost, so there is nothing to weigh the split
		// by. Every group reads 0 rather than the account's percentage.
		const s = split([ev('a', 'claude-sonnet-4', 0)], 40)
		expect(s.get('a')?.exactPct).toBe(0)
		expect(s.get('a')?.tokens).toBe(0)
	})

	it('counts only events inside the window', () => {
		const s = split(
			[
				ev('a', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T09:59:59Z')), // before
				ev('a', 'claude-sonnet-4', 5_000_000, new Date('2026-06-18T14:00:01Z')), // after
				ev('b', 'claude-sonnet-4', 1_000_000),
			],
			50,
		)
		expect(s.get('a')).toBeUndefined()
		expect(s.get('b')?.exactPct).toBeCloseTo(50, 6)
	})

	it('folds streamed segments instead of summing them', () => {
		// Two rows of one logical message: the largest wins, they do not add up.
		const a = ev('a', 'claude-sonnet-4', 400_000)
		const b = { ...ev('a', 'claude-sonnet-4', 1_000_000), messageId: a.messageId, requestId: a.requestId }
		expect(split([a, b], 50).get('a')?.tokens).toBe(1_000_000)
	})

	it('keys loose devices under null rather than dropping them', () => {
		const s = split([ev(null, 'claude-sonnet-4', 1_000_000)], 30)
		expect(s.get(null)?.exactPct).toBeCloseTo(30, 6)
	})
})

describe(groupBudgetPct, () => {
	it('reads a group at its own equal slice of the account as 100%', () => {
		// The headline rule: each group is budgeted 1/groupCount of the account, so
		// two groups splitting a 50%-used account evenly are each at their limit.
		expect(groupBudgetPct({ exactPct: 25 }, 2)).toBe(50)
		expect(groupBudgetPct({ exactPct: 50 }, 2)).toBe(100)
		expect(groupBudgetPct({ exactPct: 25 }, 4)).toBe(100)
	})

	it("stays uncapped past 100%, where a group is eating another's slice", () => {
		expect(groupBudgetPct({ exactPct: 80 }, 2)).toBe(160)
	})

	it('rounds once, after scaling, so the multiply cannot amplify the error', () => {
		// Rounding exactPct first would give 1 * 10 = 10, not 5.
		expect(groupBudgetPct({ exactPct: 0.5 }, 10)).toBe(5)
	})

	it('treats a group with no share as zero rather than throwing', () => {
		expect(groupBudgetPct(undefined, 3)).toBe(0)
	})
})
