/** Beyond this a reading is junk rather than drift, and we correct nothing: a
 *  stopped RTC reading 1970 or a replayed body would otherwise move every
 *  timestamp in the batch by an absurd amount. A clock that far behind puts its
 *  rows outside every live window, where they cost no attribution accuracy; one
 *  that far ahead is caught by the ingest clamp instead. */
const MAX_OFFSET_MS = 24 * 60 * 60 * 1000

/** How long one minimum stands before the window is re-armed. Within a window
 *  the held value can only fall, so this is what bounds how long a clock that
 *  moved the *other* way keeps being corrected by a stale offset — a laptop that
 *  was 20 minutes ahead and gets stepped back by NTP after a resume writes every
 *  event 20 minutes early until the re-arm, and `usage_event.ts` is never
 *  recomputed, while real crystal drift over an hour is sub-second.
 *
 *  Sample count per window is whatever the device's traffic gives: the collector
 *  only uploads when it has records, so a busy machine feeds the minimum dozens
 *  of readings and a machine used in short bursts can give it one. At n=1 the
 *  correction is a single raw reading, worst case inflated by a full retry
 *  backoff (~150s) — still inside one attribution bucket. */
const OFFSET_WINDOW_MS = 60 * 60 * 1000

/** Measured drift, or null when there is nothing usable to measure: a collector
 *  too old to send `sentAt`, a value that does not parse, or one too far out to
 *  be a clock. Null means "unknown", which is why this is not folded into a 0. */
function measure(sentAt: string | undefined, receivedAt: number): number | null {
	const sent = Date.parse(sentAt ?? '')
	if (Number.isNaN(sent)) {
		return null
	}
	const offset = receivedAt - sent
	return Math.abs(offset) > MAX_OFFSET_MS ? null : offset
}

/** How far a device's clock sits behind the server's, from the `sentAt` the
 *  collector stamps as it uploads. Adding it to an event timestamp puts that
 *  event on the server's timeline, the one limit change points are stamped on.
 *
 *  A single reading is drift *plus* transport: request latency, and on a retried
 *  upload the whole backoff, since `sentAt` is stamped once per batch and reused
 *  across attempts. Both are one-directional and transient, while a clock offset
 *  is persistent — so the minimum over a window estimates the clock itself and
 *  the transport falls away, the same reason NTP filters on minimum delay.
 *
 *  Returns the offset to apply together with the window it belongs to, both to
 *  be persisted on the device; null when nothing has ever been measurable. */
export function resolveClockOffset(args: {
	receivedAt: number
	sentAt: string | undefined
	stored: { at: Date | null; ms: number | null }
}): { at: Date; ms: number } | null {
	const { receivedAt, sentAt, stored } = args
	const measured = measure(sentAt, receivedAt)
	const held = stored.ms !== null && stored.at !== null ? { at: stored.at, ms: stored.ms } : null
	if (measured === null) {
		return held
	}
	if (held === null || receivedAt - held.at.getTime() > OFFSET_WINDOW_MS) {
		return { at: new Date(receivedAt), ms: measured }
	}
	// Same window: keep its start, take the lower reading.
	return { at: held.at, ms: Math.min(measured, held.ms) }
}
