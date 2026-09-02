import { mergePoints } from './limits'
import { costBuckets } from './pricing'
import type { CacheTtl, CostBuckets } from './pricing'
import type { UsageRecord } from './types'

/** Multiplier per token bucket, on top of API list prices, converting a
 *  dollar of list-price cost into percentage points of the account's limit.
 *  List prices are only a proxy for Anthropic's limit meter and a measurably
 *  biased one — the meter charges cache reads far less than the price list
 *  does — so an account with enough of its own history fits its own. */
export type BucketWeights = CostBuckets

/** Which instant of a message its cost sits at when matched against a rise. A
 *  folded message spans its first segment (`startedAt`, about when the request
 *  began) to its last (`ts`, when the response finished). Where inside that
 *  span Anthropic's meter moves is not documented, and for a response longer
 *  than the reading interval the two ends land in different intervals — so the
 *  account's own rises pick, like the lag. `end` is what the split did before
 *  there was a choice, so an absent field reads as `end`. */
export type CostAnchor = 'start' | 'end'

/** The instant `anchor` places a message at. Shared by the split and the fit
 *  so a fit can only certify the placement the split then uses. */
export function anchorTs(e: UsageRecord, anchor: CostAnchor | undefined): number {
	return (anchor === 'start' ? (e.startedAt ?? e.ts) : e.ts).getTime()
}

/** What one account's recorded history says about how Anthropic meters it.
 *  Only stored when it beats list prices on data it was not fitted to, so a
 *  fleet whose rises are driven by machines outside it keeps the plain split
 *  instead of learning noise. */
export interface Calibration {
	/** When this fit ran (ISO), so the caller can re-run it on a schedule. */
	at: string
	/** Held-out error of the list-price split. Stored rather than derived later
	 *  because it cannot be: the rises it was measured against roll off within a
	 *  week, and {@link mape} alone does not say whether the fit was worth it. */
	baselineMape: number
	/** How long an event's tokens take to show up in Anthropic's meter. Events
	 *  are shifted by this before being bucketed into attribution intervals.
	 *  Picked by held-out error like everything else, so it stays 0 unless a
	 *  delay actually shows in the data. */
	lagMs: number
	/** See {@link CostAnchor}; absent on fits stored before it existed. */
	anchor?: CostAnchor
	/** Held-out mean absolute percentage error of the fitted weights. */
	mape: number
	weights: BucketWeights
}

const BUCKETS = ['input', 'output', 'cacheWrite', 'cacheRead'] as const

/** Candidate meter delays. Anything past a few minutes would mean rises land
 *  in an interval whose events have long since ended, which delta attribution
 *  cannot represent anyway. */
const LAGS_MS = [0, 60_000, 120_000, 180_000]

/** `end` first: a later candidate must strictly beat the incumbent, so on
 *  history where the two cannot be told apart (every response inside one
 *  interval) the split keeps its pre-anchor placement. */
const ANCHORS: CostAnchor[] = ['end', 'start']

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

/** Re-price one record's list-price buckets under fitted weights, in the same
 *  "percentage points" unit the fit was solved in. Only ratios between records
 *  matter to the split, so the unit is free — but it keeps the number
 *  interpretable. Takes buckets rather than a record so the per-window
 *  aggregates the history card works from can go through it too. */
export function weightedCost(b: CostBuckets, w: BucketWeights): number {
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

/** Pair each rise with the cost incurred since the previous reading. `lagMs`
 *  is how long tokens take to reach Anthropic's meter, so the reading interval
 *  [from, to] is matched against events in [from - lagMs, to - lagMs]; sliding
 *  the two bounds is the same arithmetic as shifting every event forward, at a
 *  quarter of the work when several lags are tried. Readings where the
 *  percentage fell are window resets: they open the next interval rather than
 *  closing one, because a rise measured across a reset is not a rise. Intervals
 *  no event falls in are dropped — they are usage from outside the fleet, and
 *  asking the weights to explain a rise from nothing is how a fit learns
 *  garbage. */
function samplesFor(points: { at: Date; pct: number }[], priced: { b: CostBuckets; ts: number }[], lagMs: number) {
	const out: Sample[] = []
	let cursor = 0
	for (let i = 1; i < points.length; i++) {
		const from = points[i - 1].at.getTime() - lagMs
		const to = points[i].at.getTime() - lagMs
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
 * moved the meter this far". Weights and meter lag are chosen together by error
 * on a held-out tail the fit never sees — the first {@link TRAIN_FRACTION} of
 * the history trains, the rest scores — which is the only evidence that a
 * calibration is worth using rather than a curve drawn through noise.
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
	// The same merge the split applies, so the error measured here is the error
	// of what actually ships rather than of a full-resolution series production
	// never sees.
	const merged = mergePoints(points)
	// Priced once, outside the search: the anchor and the lag move where an event
	// sits, not what it costs.
	const priced = events.map(e => ({ b: costBuckets(e, e.model, ttl), e }))
	let best: Calibration | null = null
	// Each candidate scores on its own held-out slice, so candidates are ranked by
	// their gain over list prices rather than by raw error; seeding the best gain
	// with the gate makes "good enough to store" and "better than the last
	// candidate" one test.
	let bestGain = REQUIRED_GAIN
	for (const anchor of ANCHORS) {
		const anchored = priced.map(p => ({ b: p.b, ts: anchorTs(p.e, anchor) })).toSorted((a, b) => a.ts - b.ts)
		for (const lagMs of LAGS_MS) {
			const samples = samplesFor(merged, anchored, lagMs)
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
			// A baseline that is already exact leaves nothing to gain and no ratio to
			// rank by.
			if (baseline <= 0 || error / baseline >= bestGain) {
				continue
			}
			bestGain = error / baseline
			const [input, output, cacheWrite, cacheRead] = fitted // BUCKETS order
			best = {
				anchor,
				at: now.toISOString(),
				baselineMape: baseline,
				lagMs,
				mape: error,
				weights: { cacheRead, cacheWrite, input, output },
			}
		}
	}
	return best
}
