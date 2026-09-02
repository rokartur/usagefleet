import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useTranslations } from 'use-intl'
import { AutoRefresh } from '@/components/AutoRefresh'
import { ProjectTable } from '@/components/dashboard/ProjectTable'
import { UsageExplorer } from '@/components/dashboard/UsageExplorer'
import { WindowHistory } from '@/components/dashboard/WindowHistory'
import { LiveDashboard } from '@/components/LiveDashboard'
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
	const t = useTranslations('dash.overview')
	const { accounts, history, projects, setup } = Route.useLoaderData()
	const multi = accounts.length > 1
	return (
		<>
			{/* The live cards poll on their own; this keeps the history chart fresh. */}
			<AutoRefresh intervalMs={60_000} />
			<LiveDashboard initial={accounts.map(a => a.dash)} setup={setup} />
			{/* Past windows are per account and only show up once an account has
          closed one; a fleet that never reported gets the setup rail alone. */}
			{accounts.map(({ dash, windows }) =>
				windows.sessions.length > 0 || windows.weeks.length > 0 ? (
					<WindowHistory
						key={dash.accountId ?? 'unidentified'}
						history={windows}
						account={multi ? (dash.accountLabel ?? t('unidentifiedAccount')) : undefined}
					/>
				) : null,
			)}
			{projects.length > 0 && <ProjectTable projects={projects} />}
			{history.rows.length > 0 && <UsageExplorer history={history} />}
		</>
	)
}
