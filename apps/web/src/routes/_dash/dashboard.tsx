import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AutoRefresh } from '@/components/AutoRefresh'
import { Cockpit } from '@/components/dashboard/Cockpit'
import { getDashboardOverview, listDevices } from '@/lib/data'
import { requireUser } from '@/lib/session'

const dashboardData = createServerFn().handler(async () => {
	const user = await requireUser()
	const { accounts, history, projects } = await getDashboardOverview(user.id)
	// Only a never-reported account sees the setup rail, so this extra query costs
	// nothing once data is flowing.
	const setup = accounts.some(a => a.dash.connected) ? null : await setupState(user.id)
	return { accounts, history, projects, setup }
})

/** Newest active device (the one just added, usually) and whether any device
 *  has ever reached the API — the two facts the setup rail branches on. */
async function setupState(userId: string) {
	const active = (await listDevices(userId)).filter(d => !d.revoked)
	return {
		deviceName: active[0]?.name ?? null,
		reportedEver: active.some(d => d.lastSeenAt !== null),
	}
}

export const Route = createFileRoute('/_dash/dashboard')({
	loader: () => dashboardData(),
	component: DashboardPage,
})

function DashboardPage() {
	const { accounts, history, projects, setup } = Route.useLoaderData()
	return (
		<>
			{/* The live column polls on its own; this keeps the history chart fresh. */}
			<AutoRefresh intervalMs={60_000} />
			<Cockpit accounts={accounts} history={history} projects={projects} setup={setup} />
		</>
	)
}
