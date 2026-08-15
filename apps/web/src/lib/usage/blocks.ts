import { foldEvents, sumRecords } from './fold'
import type { TokenTotals, UsageRecord } from './types'

export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000

/** Floor a Date to the start of its UTC hour (block starts align to the hour). */
export function floorToHourUtc(d: Date): Date {
	const x = new Date(d)
	x.setUTCMinutes(0, 0, 0)
	return x
}

export interface SessionBlock {
	start: Date // floored-to-hour UTC start
	end: Date // start + 5h
	lastActivity: Date
	events: UsageRecord[]
	totals: TokenTotals
	isActive: boolean
}

/**
 * Group events into 5-hour session blocks (ccusage algorithm):
 * - block start = first event of the block, floored to the UTC hour; end = +5h
 * - a new block starts when an event is ≥5h past the current block start OR
 *   ≥5h after the previous event (an idle gap)
 * - the "active" block is one whose window still contains `now` and whose last
 *   event was <5h ago.
 * Input is folded first so streamed segments don't distort totals.
 */
export function buildSessionBlocks(rawEvents: UsageRecord[], now: Date): SessionBlock[] {
	const events = foldEvents(rawEvents).toSorted((a, b) => a.ts.getTime() - b.ts.getTime())
	const blocks: SessionBlock[] = []
	let cur: {
		start: Date
		end: Date
		events: UsageRecord[]
		last: Date
	} | null = null

	const finalize = (c: NonNullable<typeof cur>): SessionBlock => ({
		end: c.end,
		events: c.events,
		isActive: now.getTime() < c.end.getTime() && now.getTime() - c.last.getTime() < FIVE_HOURS_MS,
		lastActivity: c.last,
		start: c.start,
		totals: sumRecords(c.events),
	})

	for (const e of events) {
		const t = e.ts.getTime()
		if (cur) {
			const sinceStart = t - cur.start.getTime()
			const sinceLast = t - cur.last.getTime()
			if (sinceStart >= FIVE_HOURS_MS || sinceLast >= FIVE_HOURS_MS) {
				blocks.push(finalize(cur))
				cur = null
			}
		}
		if (!cur) {
			const start = floorToHourUtc(e.ts)
			cur = {
				end: new Date(start.getTime() + FIVE_HOURS_MS),
				events: [],
				last: e.ts,
				start,
			}
		}
		cur.events.push(e)
		cur.last = e.ts
	}
	if (cur) {
		blocks.push(finalize(cur))
	}
	return blocks
}

/** The current active 5h block, or null if the last activity is >5h old. */
export function activeBlock(events: UsageRecord[], now: Date): SessionBlock | null {
	return buildSessionBlocks(events, now).find(b => b.isActive) ?? null
}
