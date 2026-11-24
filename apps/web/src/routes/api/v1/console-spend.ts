import { createFileRoute } from '@tanstack/react-router'
import { type } from 'arktype'
import { db } from '@/db'
import { consoleSpend } from '@/db/schema'
import { costRow, toSpend } from '@/lib/anthropic-admin'
import { readJsonCapped } from '@/lib/rate-limit'
import { getSession } from '@/lib/session'

const ConsoleSpendSchema = type({
	data: costRow.array().atMostLength(1000),
	refreshedAt: 'string.date.iso | null',
	since: 'string.date.iso',
})

/** The UsageFleet browser extension posts the Console's own 30-day cost report here.
 *  Cookie-authenticated: the session cookie is SameSite=Lax, so no other site can post it. */
async function POST(req: Request) {
	const session = await getSession()
	if (!session) {
		return Response.json({ error: 'unauthorized' }, { status: 401 })
	}
	const body = await readJsonCapped(req, 512 * 1024, ConsoleSpendSchema)
	if (!body.ok) {
		return body.response
	}
	const { data, refreshedAt, since } = body.value
	const row = { spend: toSpend({ refreshedAt, rows: data, since }, []), syncedAt: new Date() }
	await db
		.insert(consoleSpend)
		.values({ ...row, userId: session.user.id })
		.onConflictDoUpdate({ set: row, target: consoleSpend.userId })
	return Response.json({ ok: true })
}

export const Route = createFileRoute('/api/v1/console-spend')({
	server: {
		handlers: {
			POST: ({ request }) => POST(request),
		},
	},
})
