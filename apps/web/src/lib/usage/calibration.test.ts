import { describe, expect, it } from 'vitest'
import { fitCalibration, weightedCost } from '@/lib/usage/calibration'
import type { BucketWeights } from '@/lib/usage/calibration'
import { costBuckets, costForTokens } from '@/lib/usage/pricing'
import type { UsageRecord } from '@/lib/usage/types'

const T0 = Date.parse('2026-01-01T00:00:00.000Z')

const record = (i: number, offsetMs: number, tokens: Partial<UsageRecord>): UsageRecord => ({
	cacheCreationTokens: 0,
	cacheReadTokens: 0,
	inputTokens: 0,
	messageId: `m${i}`,
	model: 'claude-opus-4-5',
	outputTokens: 0,
	requestId: `r${i}`,
	ts: new Date(T0 + offsetMs),
	uuid: `u${i}`,
	...tokens,
})

/** A fleet that alternates between output-heavy and cache-read-heavy work, so
 *  the two buckets are not collinear and the fit can tell them apart. Rises are
 *  generated from `truth` — recovering it is the test. */
function history(truth: BucketWeights, intervals = 60) {
	const events: UsageRecord[] = []
	const points = [{ at: new Date(T0), pct: 0 }]
	let pct = 0
	for (let i = 0; i < intervals; i++) {
		const at = T0 + (i + 1) * 10 * 60_000
		const e = record(
			i,
			(i + 0.5) * 10 * 60_000,
			i % 2 === 0
				? { cacheReadTokens: 2_000_000, outputTokens: 40_000 }
				: { cacheReadTokens: 200_000, outputTokens: 120_000 },
		)
		events.push(e)
		pct += weightedCost(e, '5m', truth)
		points.push({ at: new Date(at), pct })
	}
	return { events, points }
}

describe(costBuckets, () => {
	it('sums to the total cost, so a fitted weight of 1 everywhere is list price', () => {
		const t = {
			cacheCreation1hTokens: 3000,
			cacheCreation5mTokens: 7000,
			cacheCreationTokens: 12_000,
			cacheReadTokens: 900_000,
			inputTokens: 4000,
			outputTokens: 25_000,
		}
		const b = costBuckets(t, 'claude-opus-4-5')
		expect(b.input + b.output + b.cacheWrite + b.cacheRead).toBeCloseTo(costForTokens(t, 'claude-opus-4-5'), 12)
	})
})

describe(fitCalibration, () => {
	it('recovers the weights the meter actually used', () => {
		// Cache reads move the meter ~50× less than their list price implies —
		// the bias measured on real accounts, and the one worth correcting.
		const truth: BucketWeights = { cacheRead: 0.02, cacheWrite: 0.5, input: 1, output: 1.4 }
		const { events, points } = history(truth)
		const fit = fitCalibration(points, events, '5m')
		expect(fit).not.toBeNull()
		// Only ratios between buckets reach the split, so that is what has to land.
		const recovered = fit!.weights.output / fit!.weights.cacheRead
		expect(recovered / (truth.output / truth.cacheRead)).toBeCloseTo(1, 1)
		expect(fit!.mape).toBeLessThan(fit!.baselineMape * 0.9)
		expect(fit!.lagMs).toBe(0)
	})

	it('keeps list prices when the rises have nothing to do with the fleet', () => {
		const { events, points } = history({ cacheRead: 0.02, cacheWrite: 0.5, input: 1, output: 1.4 })
		// Same events, but the account is burnt by machines outside the fleet: the
		// rises no longer follow what the fleet did.
		let pct = 0
		const noisy = points.map((p, i) => ({ at: p.at, pct: i === 0 ? 0 : (pct += 1 + 8 * ((i * 7919) % 13)) }))
		expect(fitCalibration(noisy, events, '5m')).toBeNull()
	})

	it('needs enough history before it claims to know anything', () => {
		const { events, points } = history({ cacheRead: 0.02, cacheWrite: 0.5, input: 1, output: 1.4 }, 8)
		expect(fitCalibration(points, events, '5m')).toBeNull()
	})
})
