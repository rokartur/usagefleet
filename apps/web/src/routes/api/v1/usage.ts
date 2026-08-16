import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { devices, usageEvents } from '@/db/schema'
import { deviceWithinPlan, overPlanLimit } from '@/lib/billing'
import { authenticateDevice } from '@/lib/device-auth'
import { readJsonCapped } from '@/lib/rate-limit'

const MAX_BODY = 8 * 1024 * 1024 // 8 MB (1000 records * generous per-record)

// Identifiers and labels are free-form text from the collector, so every one of
// them needs an explicit ceiling: MAX_BODY alone allows 1000 records whose
// strings soak up the whole 8 MB and land in the database verbatim.
const ID = 200
const LABEL = 512

// Cap at a quarter of Postgres int4 max (2^31-1). The columns are int4, and the
// per-row `ROW_TOTAL` in lib/data.ts adds all four in int4 arithmetic to order
// the fold, so the ceiling has to hold for that sum, not just one column: 4 × 500M
// stays under the limit. (The `sum()` aggregates are safe either way — Postgres
// widens sum(int4) to bigint.) A looser cap lets one corrupt row raise `integer
// out of range` on every dashboard query for that user, with no in-app way to
// delete it. Real per-message counts are bounded by the context window (~1M).
const TOKENS = `0 <= number.integer <= 500000000 = 0` as const

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
	cacheReadTokens: TOKENS,
	'serviceTier?': `string <= ${ID} | null`,
	// Which app produced the record. Older collectors omit it → 'cli'.
	'source?': "'cli' | 'desktop' | 'pi' | null",
})

const BatchSchema = type({
	'os?': "'mac' | 'linux' | 'windows' | 'other'",
	'hostname?': `string <= ${LABEL}`,
	'collectorVersion?': `string <= ${ID}`,
	records: RecordSchema.array().atMostLength(1000),
})

async function POST(req: Request) {
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

	// A collector tails the machine's whole JSONL history on its first cycle, so a
	// new device would otherwise backdate the dashboard with months of usage that
	// predate the token. Counting starts when the token was issued.
	const records = batch.records.filter(r => new Date(r.timestamp) >= device.createdAt)

	// A machine with a fast clock reports future timestamps, and while the live
	// window drops those (`t <= now`), the daily aggregates have only a lower bound,
	// so they would inflate month and all-time spend forever with no way to remove
	// them. Clamped rather than rejected: the tokens were really spent, and dropping
	// them is silent permanent data loss — the collector commits its file offsets on
	// a 200 and never reads `skipped`, so a skewed machine would report nothing, for
	// good, while still looking healthy. Costs no abuse surface either: a client that
	// wanted its usage stamped `now` could always just send `now`.
	const receivedAt = Date.now()

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
			ts: new Date(Math.min(new Date(r.timestamp).getTime(), receivedAt)),
			inputTokens: r.inputTokens,
			outputTokens: r.outputTokens,
			cacheCreationTokens: r.cacheCreationTokens,
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
