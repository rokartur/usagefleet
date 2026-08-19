import { costBuckets } from './pricing'
import type { CacheTtl, CostBuckets } from './pricing'
import type { UsageRecord } from './types'

/** Multiplier per token bucket, on top of API list prices, converting a
 *  dollar of list-price cost into percentage points of the account's limit.
 *  List prices are only a proxy for Anthropic's limit meter and a measurably
 *  biased one — the meter charges cache reads far less than the price list
 *  does — so an account with enough of its own history fits its own. */
export type BucketWeights = CostBuckets

/** What one account's recorded history says about how Anthropic meters it.
 *  Only stored when it beats list prices on data it was not fitted to, so a
 *  fleet whose rises are driven by machines outside it keeps the plain split
 *  instead of learning noise. */
export interface Calibration {
	/** When this fit ran (ISO), so the caller can re-run it on a schedule. */
	at: string
	/** Held-out error of the list-price split, for comparison and for the
	 *  admin panel: the gain is only meaningful next to what it replaced. */
	baselineMape: number
	/** How long an event's tokens take to show up in Anthropic's meter. Events
	 *  are shifted by this before being bucketed into attribution intervals.
	 *  Picked by held-out error like everything else, so it stays 0 unless a
	 *  delay actually shows in the data. */
	lagMs: number
	/** Held-out mean absolute percentage error of the fitted weights. */
	mape: number
	/** Attribution intervals the fit ran on. */
	samples: number
	weights: BucketWeights
}

const BUCKETS = ['input', 'output', 'cacheWrite', 'cacheRead'] as const

/** Candidate meter delays. Anything past a few minutes would mean rises land
 *  in an interval whose events have long since ended, which delta attribution
 *  cannot represent anyway. */
const LAGS_MS = [0, 60_000, 120_000, 180_000]

/** Below this many rises the held-out slice is a handful of points and its
 *  error says more about which day the split fell on than about the weights. */
const MIN_SAMPLES = 20

/** The fit must beat list prices by a clear margin on held-out data, not tie
 *  with them — a wash means the extra machinery buys nothing and list prices
 *  are the honest default. */
const REQUIRED_GAIN = 0.9

const TRAIN_FRACTION = 0.7

/** How far a bucket's weight may stray from what list prices imply, as a
 *  multiple of the scalar the baseline fits. A bucket the account barely uses
 *  carries almost no signal, and least squares will happily hand it a weight
 *  that changes nothing on the data it was fitted to and misattributes wildly
 *  the first time that bucket is used in earnest — measured on a real account,
 *  whose plain-input weight came out 400× its output weight, next to millions
 *  of cache-read tokens it could hide behind. Scaled off the baseline rather
 *  than fixed, because pct-per-dollar depends on the plan. */
const MAX_BUCKET_MULTIPLE = 20

/** Cost of one record under fitted weights, in the same "percentage points"
 *  unit the fit was solved in. Only ratios between records matter to the
 *  split, so the unit is free — but it keeps the number interpretable. */
export function weightedCost(e: UsageRecord, ttl: CacheTtl, w: BucketWeights): number {
	const b = costBuckets(e, e.model, ttl)
	return b.input * w.input + b.output * w.output + b.cacheWrite * w.cacheWrite + b.cacheRead * w.cacheRead
}

/** One rise of the official percentage and the list-price cost, per bucket, of
 *  everything that happened since the previous reading. */
interface Sample {
	buckets: number[]
	rise: number
}

/** Non-negative least squares by multiplicative updates (Lee & Seung): every
 *  feature and every target here is a non-negative quantity, and a negative
 *  weight would mean a token bucket that *refunds* limit, so the constraint is
 *  the model, not a regularizer. Converges monotonically; no line search.
 *
 *  ponytail: fixed iteration count instead of a convergence test — 4 features
 *  over ~100 rows settles well inside it. Revisit if the feature set grows. */
function nnls(x: number[][], y: number[], ceiling: number, iterations = 500): number[] {
	const width = x[0]?.length ?? 0
	const w = Array.from<number>({ length: width }).fill(1)
	const num = Array.from<number>({ length: width }).fill(0)
	const den = Array.from<number>({ length: width }).fill(0)
	for (let it = 0; it < iterations; it++) {
		num.fill(0)
		den.fill(0)
		for (let i = 0; i < x.length; i++) {
			const row = x[i]
			let predicted = 0
			for (let j = 0; j < width; j++) {
				predicted += row[j] * w[j]
			}
			for (let j = 0; j < width; j++) {
				num[j] += row[j] * y[i]
				den[j] += row[j] * predicted
			}
		}
		for (let j = 0; j < width; j++) {
			// A bucket nothing in this account uses (no 1h cache writes, say) has
			// num = den = 0 and keeps its starting weight; it never reaches the
			// prediction, so its value cannot matter.
			w[j] = Math.min(den[j] > 0 ? w[j] * (num[j] / den[j]) : w[j], ceiling)
		}
	}
	return w
}

const mape = (predicted: number[], actual: number[]) =>
	(100 * predicted.reduce((s, p, i) => s + Math.abs(p - actual[i]) / actual[i], 0)) / predicted.length

/** Best single scalar k for `rise ≈ k · totalCost` — the list-price baseline,
 *  fitted the same way the weights are so the comparison is fair. */
const scalarFit = (samples: Sample[]) => {
	const total = (s: Sample) => s.buckets.reduce((a, b) => a + b, 0)
	const den = samples.reduce((a, s) => a + total(s) ** 2, 0)
	return den > 0 ? samples.reduce((a, s) => a + total(s) * s.rise, 0) / den : 0
}

/** Pair each rise with the cost incurred since the previous reading, shifting
 *  event timestamps by `lagMs` first. Readings where the percentage fell are
 *  window resets: they open the next interval rather than closing one, because
 *  a rise measured across a reset is not a rise. Intervals no event falls in
 *  are dropped — they are usage from outside the fleet, and asking the weights
 *  to explain a rise from nothing is how a fit learns garbage. */
function samplesFor(points: { at: Date; pct: number }[], events: UsageRecord[], ttl: CacheTtl, lagMs: number) {
	const priced = events
		.map(e => ({ b: costBuckets(e, e.model, ttl), ts: e.ts.getTime() + lagMs }))
		.toSorted((a, b) => a.ts - b.ts)
	const out: Sample[] = []
	let cursor = 0
	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1].at.getTime()
		const to = points[i].at.getTime()
		while (cursor < priced.length && priced[cursor].ts <= from) {
			cursor += 1
		}
		const start = cursor
		while (cursor < priced.length && priced[cursor].ts <= to) {
			cursor += 1
		}
		const rise = points[i].pct - points[i - 1].pct
		if (rise <= 0) {
			continue
		}
		const buckets = BUCKETS.map(() => 0)
		for (let e = start; e < cursor; e++) {
			for (let j = 0; j < BUCKETS.length; j++) {
				buckets[j] += priced[e].b[BUCKETS[j]]
			}
		}
		if (buckets.some(v => v > 0)) {
			out.push({ buckets, rise })
		}
	}
	return out
}

/**
 * Fit this account's own limit weights from its recorded rises.
 *
 * The rises are Anthropic's own numbers and the events are what the fleet did
 * between them, so each interval is a labelled example of "this much usage
 * moved the meter this far". Weights and meter lag are chosen together by
 * error on the last {@link TRAIN_FRACTION} of the history, which the fit never
 * sees — the only evidence that a calibration is worth using rather than a
 * curve drawn through noise.
 *
 * Returns null when there is not enough history, or when list prices already
 * do as well: the caller then keeps splitting by list price.
 */
export function fitCalibration(
	points: { at: Date; pct: number }[],
	events: UsageRecord[],
	ttl: CacheTtl,
	now = new Date(),
): Calibration | null {
	const sorted = points.toSorted((a, b) => a.at.getTime() - b.at.getTime())
	let best: Calibration | null = null
	for (const lagMs of LAGS_MS) {
		const samples = samplesFor(sorted, events, ttl, lagMs)
		if (samples.length < MIN_SAMPLES) {
			continue
		}
		// Split by time, not at random: the question is whether weights fitted on
		// what an account did last week still describe what it does today.
		const cut = Math.floor(samples.length * TRAIN_FRACTION)
		const train = samples.slice(0, cut)
		const test = samples.slice(cut)
		if (test.length === 0) {
			continue
		}
		const actual = test.map(s => s.rise)
		const k = scalarFit(train)
		const fitted = nnls(
			train.map(s => s.buckets),
			train.map(s => s.rise),
			k * MAX_BUCKET_MULTIPLE,
		)
		const error = mape(
			test.map(s => s.buckets.reduce((a, v, j) => a + v * fitted[j], 0)),
			actual,
		)
		const baseline = mape(
			test.map(s => k * s.buckets.reduce((a, b) => a + b, 0)),
			actual,
		)
		if (error > baseline * REQUIRED_GAIN || (best && error >= best.mape)) {
			continue
		}
		best = {
			at: now.toISOString(),
			baselineMape: baseline,
			lagMs,
			mape: error,
			samples: samples.length,
			weights: {
				cacheRead: fitted[BUCKETS.indexOf('cacheRead')],
				cacheWrite: fitted[BUCKETS.indexOf('cacheWrite')],
				input: fitted[BUCKETS.indexOf('input')],
				output: fitted[BUCKETS.indexOf('output')],
			},
		}
	}
	return best
}
