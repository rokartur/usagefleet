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

/** A fleet whose output/cache-read mix drifts from interval to interval, so the
 *  two buckets are not collinear and the fit can tell them apart. Deliberately
 *  aperiodic: with a repeating mix, pairing every rise with the *previous*
 *  interval's event solves just as exactly as the truth does, and a lag search
 *  cannot be tested against a fixture that admits two perfect answers.
 *
 *  Rises are generated from `truth` — recovering it is the test.
 *
 *  `eventOffsetMs` places event `i` relative to the start of the interval whose
 *  rise it caused. Negative means the meter reported it late, which is what a
 *  non-zero {@link Calibration.lagMs} exists to undo. */
function history(truth: BucketWeights, intervals = 60, strideMs = 10 * 60_000, eventOffsetMs = strideMs / 2) {
	const events: UsageRecord[] = []
	const points = [{ at: new Date(T0), pct: 0 }]
	let pct = 0
	for (let i = 0; i < intervals; i++) {
		// 7919/97 are coprime, so the mix does not repeat inside a run this long.
		const r = ((i * 7919) % 97) / 97
		const e = record(i, i * strideMs + eventOffsetMs, {
			cacheReadTokens: Math.round(200_000 + r * 3_000_000),
			outputTokens: Math.round(20_000 + (1 - r) * 150_000),
		})
		events.push(e)
		pct += weightedCost(costBuckets(e, e.model, '5m'), truth)
		points.push({ at: new Date(T0 + (i + 1) * strideMs), pct })
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
		// Cache reads move the meter far less than their list price implies — the
		// bias measured on real accounts (~16× against output), exaggerated here so
		// a fit that only half-recovers it still fails the assertion.
		const truth: BucketWeights = { cacheRead: 0.02, cacheWrite: 0.5, input: 1, output: 1.4 }
		const { events, points } = history(truth)
		const fit = fitCalibration(points, events, '5m')
		expect(fit).not.toBeNull()
		// Only ratios between buckets reach the split, so that is what has to land —
		// and only to within a band: the two buckets are close enough to collinear
		// that a spread of ratios predicts the rises about equally well. List prices
		// put this ratio at 1, so landing near 70 is the whole point.
		const recovered = fit!.weights.output / fit!.weights.cacheRead
		expect(recovered / (truth.output / truth.cacheRead)).toBeGreaterThan(0.8)
		expect(recovered / (truth.output / truth.cacheRead)).toBeLessThan(1.25)
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

	it('finds the meter delay when work lands one interval before the rise it caused', () => {
		const truth: BucketWeights = { cacheRead: 0.02, cacheWrite: 0.5, input: 1, output: 1.4 }
		// 90s readings with every event 45s before its own interval opens: at lag 0
		// each rise is paired with the previous interval's event, whose bucket mix is
		// unrelated, so only a shifted fit can recover the weights at all.
		const { events, points } = history(truth, 60, 90_000, -45_000)
		const fit = fitCalibration(points, events, '5m')
		expect(fit).not.toBeNull()
		expect(fit?.lagMs).toBeGreaterThan(0)
		const recovered = fit!.weights.output / fit!.weights.cacheRead
		expect(recovered / (truth.output / truth.cacheRead)).toBeGreaterThan(0.8)
		expect(recovered / (truth.output / truth.cacheRead)).toBeLessThan(1.25)
	})
})
