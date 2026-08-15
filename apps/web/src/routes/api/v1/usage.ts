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

// Cap below Postgres int4 max (2^31-1) so a corrupt/malicious value is a clean
// 400 instead of a numeric-overflow 500 that rejects the whole batch. Real
// per-message counts are bounded by the context window (~1M), far below this.
const TOKENS = `0 <= number.integer <= 2000000000 = 0` as const

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
	'os?': "'mac' | 'linux' | 'windows'",
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
		return overPlanLimit()
	}

	const body = await readJsonCapped(req, MAX_BODY, BatchSchema)
	if (!body.ok) {
		return body.response
	}
	const batch = body.value

	let accepted = 0
	if (batch.records.length > 0) {
		const rows = batch.records.map(r => ({
			id: randomUUID(),
			userId: device.userId,
			deviceId: device.id,
			uuid: r.uuid,
			messageId: r.messageId ?? null,
			requestId: r.requestId ?? null,
			model: r.model ?? null,
			sessionId: r.sessionId ?? null,
			ts: new Date(r.timestamp),
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
			os: batch.os ?? device.os,
			hostname: batch.hostname ?? device.hostname,
			collectorVersion: batch.collectorVersion ?? device.collectorVersion,
		})
		.where(eq(devices.id, device.id))

	return Response.json({
		accepted,
		duplicates: batch.records.length - accepted,
	})
}

export const Route = createFileRoute('/api/v1/usage')({
	server: {
		handlers: {
			POST: ({ request }) => POST(request),
		},
	},
})
