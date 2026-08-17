import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { devices, usageEvents } from '@/db/schema'
import { deviceWithinPlan, overPlanLimit } from '@/lib/billing'
import { authenticateDevice } from '@/lib/device-auth'
import { readJsonCapped } from '@/lib/rate-limit'
import { resolveClockOffset } from '@/lib/usage/clock'

const MAX_BODY = 8 * 1024 * 1024 // 8 MB (1000 records * generous per-record)

// Identifiers and labels are free-form text from the collector, so every one of
// them needs an explicit ceiling: MAX_BODY alone allows 1000 records whose
// strings soak up the whole 8 MB and land in the database verbatim.
const ID = 200
const LABEL = 512

// The columns are int4, so each count has to fit on its own; 500M leaves plenty
// of headroom over the ~1M a context window can actually produce. Summing is not
// the constraint: `sum()` widens to bigint, and `ROW_TOTAL` in lib/data.ts casts
// its first operand (keep that cast — rows predating this cap are still out there).
const TOKENS = `0 <= number.integer <= 500000000 = 0` as const
// Same bound without the `= 0` default: for the cache-TTL breakdown, absent
// means "unknown, price by the user's TTL setting", not zero.
const TOKENS_OPT = `0 <= number.integer <= 500000000 | null` as const

const RecordSchema = type({
	uuid: `1 <= string <= ${ID}`,
	'messageId?': `string <= ${ID} | null`,
	'requestId?': `string <= ${ID} | null`,
	'model?': `string <= ${ID} | null`,
	'sessionId?': `string <= ${ID} | null`,
	timestamp: type(`string <= 64`).and('string.date'),
	'cwd?': `string <= ${LABEL} | null`,
	'gitBranch?': `string <= ${LABEL} | null`,
	'version?': `string <= ${ID} | null`,
	inputTokens: TOKENS,
	outputTokens: TOKENS,
	cacheCreationTokens: TOKENS,
	// Per-TTL split of cacheCreationTokens (5m vs 1h writes price differently).
	// Omitted by collectors/logs that predate the breakdown.
	'cacheCreation5m?': TOKENS_OPT,
	'cacheCreation1h?': TOKENS_OPT,
	cacheReadTokens: TOKENS,
	'serviceTier?': `string <= ${ID} | null`,
	// Which app produced the record. Older collectors omit it → 'cli'.
	'source?': "'cli' | 'desktop' | 'pi' | null",
})

const BatchSchema = type({
	// Stamped by the collector as it uploads: the only read we get on the device's
	// clock, and every event timestamp in the batch comes off that same clock.
	'sentAt?': type(`string <= 64`).and('string.date'),
	'os?': "'mac' | 'linux' | 'windows' | 'other'",
	'hostname?': `string <= ${LABEL}`,
	'collectorVersion?': `string <= ${ID}`,
	records: RecordSchema.array().atMostLength(1000),
})

async function POST(req: Request) {
	// Taken before auth and before the body is read: anything after this point is
	// our own latency, and booking it as the device's drift would push every
	// correction one-directionally (a 8 MB backfill chunk on a slow uplink is
	// seconds, not the sub-second the minimum filter is meant to absorb).
	const receivedAt = Date.now()
	const auth = await authenticateDevice(req, 'ingest', 240) // 240 req/min/device
	if ('response' in auth) {
		return auth.response
	}
	const { device } = auth
	if (!(await deviceWithinPlan(device))) {
		return overPlanLimit(device.id)
	}

	const body = await readJsonCapped(req, MAX_BODY, BatchSchema)
	if (!body.ok) {
		return body.response
	}
	const batch = body.value

	// Align the batch onto our clock before any decision that reads a timestamp:
	// which window a row lands in, whether it predates the token, and above all
	// which interval's rise it explains in the group split (lib/usage/clock.ts).
	const clock = resolveClockOffset({
		receivedAt,
		sentAt: batch.sentAt,
		stored: { at: device.clockOffsetAt, ms: device.clockOffsetMs },
	})
	const shifted = (r: { timestamp: string }) => new Date(r.timestamp).getTime() + (clock?.ms ?? 0)
	const tsOf = (r: { timestamp: string }) => Math.min(shifted(r), receivedAt)

	// A collector tails the machine's whole JSONL history on its first cycle, so a
	// new device would otherwise backdate the dashboard with months of usage that
	// predate the token. Counting starts when the token was issued.
	const records = batch.records.filter(r => tsOf(r) >= device.createdAt.getTime())

	// Counted over the whole batch, not the surviving rows: a badly skewed device
	// is exactly the one whose rows also fail the filter above, and it is the case
	// this diagnostic exists to surface.
	const clamped = batch.records.filter(r => shifted(r) > receivedAt).length

	let accepted = 0
	if (records.length > 0) {
		const rows = records.map(r => ({
			id: randomUUID(),
			userId: device.userId,
			deviceId: device.id,
			uuid: r.uuid,
			messageId: r.messageId ?? null,
			requestId: r.requestId ?? null,
			model: r.model ?? null,
			sessionId: r.sessionId ?? null,
			// Clamped, not dropped: the daily aggregates have no upper bound, so one
			// fast clock would inflate month and all-time spend forever. Rejecting
			// instead would be silent permanent loss — the collector commits its file
			// offsets on any 200 and never reads `skipped`. Counted so a skewed machine
			// is diagnosable rather than just quietly wrong. The clamp still runs after
			// the offset correction: it is the guard for a clock we could not measure.
			ts: new Date(tsOf(r)),
			inputTokens: r.inputTokens,
			outputTokens: r.outputTokens,
			cacheCreationTokens: r.cacheCreationTokens,
			cacheCreation5mTokens: r.cacheCreation5m ?? null,
			cacheCreation1hTokens: r.cacheCreation1h ?? null,
			cacheReadTokens: r.cacheReadTokens,
			serviceTier: r.serviceTier ?? null,
			cwd: r.cwd ?? null,
			gitBranch: r.gitBranch ?? null,
			claudeVersion: r.version ?? null,
			source: r.source ?? 'cli',
		}))
		const inserted = await db
			.insert(usageEvents)
			.values(rows)
			.onConflictDoNothing({ target: [usageEvents.userId, usageEvents.uuid] })
			.returning({ id: usageEvents.id })
		accepted = inserted.length
	}

	await db
		.update(devices)
		.set({
			// Rides along on the heartbeat update rather than costing its own write.
			// `clock` is null only when nothing was ever measured, in which case there
			// is nothing to write — resolveClockOffset already passes the stored pair
			// through when a single reading is unusable.
			...(clock && { clockOffsetAt: clock.at, clockOffsetMs: clock.ms }),
			lastSeenAt: new Date(),
			// `other` (freebsd/sunos/…) has no enum value and the column is display-only,
			// so an unlabelled box keeps what it had rather than forcing a migration.
			os: (batch.os === 'other' ? null : batch.os) ?? device.os,
			hostname: batch.hostname ?? device.hostname,
			collectorVersion: batch.collectorVersion ?? device.collectorVersion,
		})
		.where(eq(devices.id, device.id))

	return Response.json({
		accepted,
		// Stored, but with a timestamp we moved. Nothing else in the response would
		// reveal a machine whose clock is wrong, and its rows land in the live window
		// and skew that group's cost share.
		clamped,
		// Drift we corrected for, in ms, positive when the device is behind. Same
		// reason as `clamped`: makes a bad clock diagnosable with one curl.
		clockOffsetMs: clock?.ms ?? null,
		duplicates: records.length - accepted,
		// Pre-activation rows are neither stored nor duplicates, so they get their
		// own count rather than inflating `duplicates` on a new device's first cycle.
		skipped: batch.records.length - records.length,
	})
}

export const Route = createFileRoute('/api/v1/usage')({
	server: {
		handlers: {
			POST: ({ request }) => POST(request),
		},
	},
})
