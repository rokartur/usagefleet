import { createFileRoute } from '@tanstack/react-router'
import { getLiveDashboards, toDashboardDTO } from '@/lib/data'
import { getSession } from '@/lib/session'

/** Live dashboard data for the signed-in user (polled by the client), one entry
 *  per Anthropic account the fleet reports on. */
async function GET() {
	const session = await getSession()
	if (!session) {
		return Response.json({ error: 'unauthorized' }, { status: 401 })
	}
	const dashboards = await getLiveDashboards(session.user.id)
	return Response.json(dashboards.map(toDashboardDTO), {
		headers: { 'cache-control': 'no-store' },
	})
}

export const Route = createFileRoute('/api/dashboard')({
	server: {
		handlers: {
			GET: () => GET(),
		},
	},
})
