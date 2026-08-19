import { describe, expect, it } from 'vitest'
import { buildPastWindows, groupBudgetPct, shouldRecordPoint, splitByShare, UNATTRIBUTED, windowStartOf } from './data'
import type { WindowAggRow } from './data'
import type { UsageRecord } from './usage'

const STRIDE = 5 * 60 * 60 * 1000
const START = new Date('2026-06-18T10:00:00Z')

const cell = (groupId: string | null, model: string, billable: number): WindowAggRow => ({
	binStart: START.getTime(),
	groupId,
	model,
	totals: {
		cacheCreation1hTokens: 0,
		cacheCreation5mTokens: 0,
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
const build = (rows: WindowAggRow[], pct: number | null) =>
	buildPastWindows(rows, [{ end: START.getTime() + STRIDE, pct, start: START.getTime() }], '1h', label)

describe(buildPastWindows, () => {
	it("splits the window's reported utilization across groups by cost share", () => {
		// Same token count, but opus costs 5x sonnet — so it eats 5/6 of the 60%.
		const [w] = build([cell('a', 'claude-opus-4', 1_000_000), cell('b', 'claude-sonnet-4', 1_000_000)], 60)
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
		const [w] = build([cell('a', 'claude-sonnet-4', 500_000)], null)
		expect(w.accountPct).toBeNull()
		expect(w.groups[0]).toMatchObject({ accountPct: null, tokens: 500_000 })
	})

	it('drops windows with no activity', () => {
		expect(build([], 40)).toStrictEqual([])
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

	const pt = (at: string, pct: number) => ({ at: new Date(at), pct })

	it('attributes each recorded rise to the groups active in its interval', () => {
		// b's events cost 9× a's, but the readings say the pct rose 30 while only a
		// worked and 20 while only b did — time beats cost.
		const s = splitByShare(
			[
				ev('a', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T10:30:00Z')),
				ev('b', 'claude-sonnet-4', 9_000_000, new Date('2026-06-18T13:30:00Z')),
			],
			WIN_START,
			NOW,
			50,
			'5m',
			[pt('2026-06-18T11:00:00Z', 30), pt('2026-06-18T14:00:00Z', 50)],
		)
		expect(s.get('a')?.exactPct).toBeCloseTo(30, 6)
		expect(s.get('b')?.exactPct).toBeCloseTo(20, 6)
	})

	it('parks a rise no monitored event can explain under UNATTRIBUTED', () => {
		// The account hit 40% before the only monitored event existed; the synthetic
		// final reading tops the rest up to the official 50.
		const s = splitByShare(
			[ev('a', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T13:00:00Z'))],
			WIN_START,
			NOW,
			50,
			'5m',
			[pt('2026-06-18T11:00:00Z', 40)],
		)
		expect(s.get(UNATTRIBUTED)?.exactPct).toBeCloseTo(40, 6)
		expect(s.get('a')?.exactPct).toBeCloseTo(10, 6)
	})

	it('degrades to the whole-window cost split when no readings exist', () => {
		// Empty points → one synthetic interval spanning the window → the classic
		// cost weighting (opus input costs 5× sonnet).
		const s = splitByShare(
			[ev('a', 'claude-opus-4', 1_000_000), ev('b', 'claude-sonnet-4', 1_000_000)],
			WIN_START,
			NOW,
			60,
			'5m',
			[],
		)
		expect(s.get('a')?.exactPct).toBeCloseTo(50, 6)
		expect(s.get('b')?.exactPct).toBeCloseTo(10, 6)
		expect(s.get(UNATTRIBUTED)).toBeUndefined()
	})

	it('merges readings closer than five minutes into one attribution interval', () => {
		// Readings land every minute during a's burst; unmerged, the 10:30→10:31 and
		// 10:32→10:36 rises would find no event inside their hairline intervals and
		// leak to UNATTRIBUTED. Merged, a's one event carries the whole 10:30→10:36
		// rise; only the pre-event climb to 5 stays unattributed.
		const s = splitByShare(
			[ev('a', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T10:31:30Z'))],
			WIN_START,
			NOW,
			20,
			'5m',
			[
				pt('2026-06-18T10:30:00Z', 5),
				pt('2026-06-18T10:31:00Z', 10),
				pt('2026-06-18T10:32:00Z', 15),
				pt('2026-06-18T10:36:00Z', 20),
			],
		)
		expect(s.get('a')?.exactPct).toBeCloseTo(15, 6)
		expect(s.get(UNATTRIBUTED)?.exactPct).toBeCloseTo(5, 6)
	})

	it('gives a falling interval no weight and keeps its events out of the next one', () => {
		// The account corrected 40 → 10 before climbing back to 30. b worked only
		// during that fall, so it explains nothing; a and c share the two real rises
		// (40 and 20) normalized onto the official 30.
		const s = splitByShare(
			[
				ev('a', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T10:30:00Z')),
				ev('b', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T11:30:00Z')),
				ev('c', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T12:30:00Z')),
			],
			WIN_START,
			NOW,
			30,
			'5m',
			[pt('2026-06-18T11:00:00Z', 40), pt('2026-06-18T12:00:00Z', 10), pt('2026-06-18T13:00:00Z', 30)],
		)
		expect(s.get('a')?.exactPct).toBeCloseTo(20, 6)
		expect(s.get('c')?.exactPct).toBeCloseTo(10, 6)
		expect(s.get('b')?.exactPct).toBe(0)
	})

	it('drops an unattributed sliver from the split and from the denominator', () => {
		// A 0.2pp climb before a's first event is timing noise, not a device off the
		// fleet. Dropping it must not leave the real groups summing to 39.8.
		const s = splitByShare(
			[ev('a', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T10:30:00Z'))],
			WIN_START,
			NOW,
			40,
			'5m',
			[pt('2026-06-18T10:06:00Z', 0.2), pt('2026-06-18T11:00:00Z', 40)],
		)
		expect(s.get(UNATTRIBUTED)).toBeUndefined()
		expect(s.get('a')?.exactPct).toBeCloseTo(40, 6)
	})

	it('caps a backlogged device at the rises of the intervals it worked in', () => {
		// Why per-model limits record change points too: `late` uploads a day's worth
		// of events at once, dwarfing `live` on cost. Whole-window cost share lets that
		// backlog rewrite the entire window and flip who leads; delta attribution can
		// only hand it the 10pp that actually accrued while it was working.
		const events = [
			ev('late', 'claude-sonnet-4', 9_000_000, new Date('2026-06-18T10:30:00Z')),
			ev('live', 'claude-sonnet-4', 1_000_000, new Date('2026-06-18T13:30:00Z')),
		]
		const byCost = splitByShare(events, WIN_START, NOW, 50, '5m')
		expect(byCost.get('late')?.exactPct).toBeCloseTo(45, 6)

		const byRise = splitByShare(events, WIN_START, NOW, 50, '5m', [
			pt('2026-06-18T11:00:00Z', 10),
			pt('2026-06-18T14:00:00Z', 50),
		])
		expect(byRise.get('late')?.exactPct).toBeCloseTo(10, 6)
		expect(byRise.get('live')?.exactPct).toBeCloseTo(40, 6)
	})
})

describe(windowStartOf, () => {
	const NOON = new Date('2026-06-18T12:00:00Z')
	const HOUR = 60 * 60 * 1000

	it('starts the window one length before the reported reset', () => {
		expect(windowStartOf(new Date('2026-06-18T14:00:00Z'), NOON, 5 * HOUR)).toStrictEqual(
			new Date('2026-06-18T09:00:00Z'),
		)
	})

	it('falls back to the rolling window when the reset is stale or missing', () => {
		// A reset already in the past means the collector has not reported since the
		// window turned over. Taking it literally would start the window before the
		// current one, weighing events from a window that already closed.
		expect(windowStartOf(new Date('2026-06-18T09:00:00Z'), NOON, 5 * HOUR)).toStrictEqual(
			new Date('2026-06-18T07:00:00Z'),
		)
		expect(windowStartOf(null, NOON, 5 * HOUR)).toStrictEqual(new Date('2026-06-18T07:00:00Z'))
	})

	it('rejects a reset further ahead than one whole window', () => {
		// resetsAt is device-reported and range-checked nowhere on the way in. Taken
		// literally it would open the window in the future, leaving it empty, and the
		// account's entire percentage would read as unattributed.
		expect(windowStartOf(new Date('2026-06-19T12:00:00Z'), NOON, 5 * HOUR)).toStrictEqual(
			new Date('2026-06-18T07:00:00Z'),
		)
		// Exactly one window ahead is the legitimate boundary: a window that just
		// opened, so it must survive.
		expect(windowStartOf(new Date('2026-06-18T17:00:00Z'), NOON, 5 * HOUR)).toStrictEqual(NOON)
	})
})

describe(shouldRecordPoint, () => {
	const prev = { at: new Date('2026-06-18T11:00:00Z'), pct: 40 }
	const after = (mins: number) => new Date(prev.at.getTime() + mins * 60_000)

	it("records the window's first reading whatever it says", () => {
		// After a reset the caller scopes prev to the new window, so this is how the
		// floor gets in despite being far below the previous window's peak.
		expect(shouldRecordPoint(undefined, 2, after(0))).toBeTruthy()
	})

	it('refuses a fall, so an out-of-order post cannot fabricate a rise', () => {
		// Two devices read Anthropic moments apart and their posts land reversed.
		// Storing the dip would make the recovery back to 40 read as a second rise.
		expect(shouldRecordPoint(prev, 39.8, after(10))).toBeFalsy()
		expect(shouldRecordPoint(prev, 40, after(10))).toBeFalsy()
	})

	it('thins rises to the resolution the split reads at', () => {
		expect(shouldRecordPoint(prev, 45, after(4))).toBeFalsy()
		expect(shouldRecordPoint(prev, 45, after(5))).toBeTruthy()
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
