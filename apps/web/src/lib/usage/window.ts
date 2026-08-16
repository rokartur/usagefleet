import type { UsageRecord } from './types'

/** How far back the per-project table looks. Fixed rather than user-picked: it
 *  bounds the scan, and "what am I working on lately" needs no date picker.
 *  Lives here, not beside the query, because the table renders the number and a
 *  component may not import the server-only data layer. */
export const PROJECT_DAYS = 30

/**
 * Start of the current weekly window: the most recent occurrence of
 * `weekday`@`hourUtc` (UTC) at or before `now`. weekday: 0=Sun..6=Sat.
 */
export function weekWindowStart(now: Date, weekday: number, hourUtc: number): Date {
	const d = new Date(now)
	d.setUTCHours(hourUtc, 0, 0, 0)
	const dayDiff = (d.getUTCDay() - weekday + 7) % 7
	d.setUTCDate(d.getUTCDate() - dayDiff)
	if (d.getTime() > now.getTime()) {
		d.setUTCDate(d.getUTCDate() - 7)
	}
	return d
}

/**
 * Starts of the `count` most recent COMPLETED windows of length `strideMs`,
 * newest first. `origin` is any known boundary of that window series — e.g. the
 * collector-reported `resets_at`, which sits in the *future* — so the windows
 * line up with Claude's real reset schedule instead of an arbitrary "now minus
 * 5h". The window containing `now` is excluded (it is still filling).
 */
export function pastWindowStarts(origin: Date, strideMs: number, now: Date, count: number): Date[] {
	const elapsed = now.getTime() - origin.getTime()
	const currentStart = origin.getTime() + Math.floor(elapsed / strideMs) * strideMs
	return Array.from({ length: count }, (_, i) => new Date(currentStart - (i + 1) * strideMs))
}

/** One past limit window: a real recorded one (pct = its peak utilization) or
 *  a grid-guessed / clipped filler for time no sample covers (pct = null). */
export interface WindowSpan {
	/** Epoch ms. */
	start: number
	end: number
	pct: number | null
}

/** Ignore filler fragments shorter than this — boundary slivers between a real
 *  window and the grid carry a handful of tokens and would render as noise. */
const MIN_SPAN_MS = 5 * 60 * 1000

/**
 * The `count` most recent completed limit windows, newest first.
 *
 * Anthropic's windows are NOT on a fixed grid — after idle time the next one
 * starts at the first prompt — so the recorded utilization samples, whose
 * `windowStart` is the reset instant minus the window length, are the real
 * boundaries. Sampled windows are used verbatim. Time no sample covers is
 * filled with `pastWindowStarts` grid windows (anchored on the CURRENT reset
 * phase — the best guess available), clipped where they overlap a sampled
 * window so usage between known windows still shows up, attributed to an
 * honest partial span rather than a wrong-phase full one.
 *
 * `samples` may include the currently open window; it is excluded from the
 * output (still filling) but still masks the filler grid.
 */
export function windowSpans(
	samples: { start: number; pct: number }[],
	strideMs: number,
	origin: Date,
	now: Date,
	count: number,
): WindowSpan[] {
	// Cluster near-duplicates: reset instants for one real window can jitter by
	// seconds across reports, and each jittered value is its own DB row.
	const sorted = samples.toSorted((a, b) => b.start - a.start)
	const real: { start: number; pct: number }[] = []
	for (const s of sorted) {
		const prev = real.at(-1)
		if (prev && prev.start - s.start < strideMs / 2) {
			prev.pct = Math.max(prev.pct, s.pct)
		} else {
			real.push({ ...s })
		}
	}

	const spans: WindowSpan[] = real
		.filter(s => s.start + strideMs <= now.getTime())
		.map(s => ({ end: s.start + strideMs, pct: s.pct, start: s.start }))

	// Grid fillers for uncovered time. Extra depth so clipped-away grid windows
	// don't shrink the reach below `count`.
	const covered = real.map(s => [s.start, s.start + strideMs] as const)
	for (const g of pastWindowStarts(origin, strideMs, now, count + real.length)) {
		let start = g.getTime()
		let end = start + strideMs
		for (const [cs, ce] of covered) {
			if (cs >= end || ce <= start) {
				continue
			}
			if (cs <= start && ce >= end) {
				// fully inside a sampled window — nothing left of this filler
				start = end
				break
			}
			// Clip the overlapping edge. Two sampled neighbours can clip both edges,
			// leaving the fragment between them.
			if (cs <= start) {
				start = ce
			} else {
				end = cs
			}
		}
		if (end - start >= MIN_SPAN_MS) {
			spans.push({ end, pct: null, start })
		}
	}

	spans.sort((a, b) => b.start - a.start)
	return spans.slice(0, count)
}

export function filterByWindow(events: UsageRecord[], start: Date, end: Date): UsageRecord[] {
	const s = start.getTime()
	const e = end.getTime()
	return events.filter(x => {
		const t = x.ts.getTime()
		return t >= s && t <= e
	})
}
