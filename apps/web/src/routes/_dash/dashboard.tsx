import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AutoRefresh } from '@/components/AutoRefresh'
import { UsageExplorer } from '@/components/dashboard/UsageExplorer'
import { WindowHistory } from '@/components/dashboard/WindowHistory'
import { LiveDashboard } from '@/components/LiveDashboard'
import {
	getHistory,
	getLiveDashboards,
	getWindowHistory,
	listAccountViews,
	listDevices,
	toDashboardDTO,
} from '@/lib/data'
import { requireUser } from '@/lib/session'

const dashboardData = createServerFn().handler(async () => {
	const user = await requireUser()
	const now = new Date()
	// One set of numbers per Anthropic account the fleet reports on: the
	// percentages are Anthropic's and Anthropic meters each subscription
	// separately.
	const [dashboards, history, views] = await Promise.all([
		getLiveDashboards(user.id),
		getHistory(user.id),
		listAccountViews(user.id),
	])
	const accounts = await Promise.all(
		dashboards.map(async dash => ({
			dash: toDashboardDTO(dash),
			windows: await getWindowHistory(
				views.find(v => (v.account?.id ?? null) === dash.accountId) ?? views[0],
				now,
			),
		})),
	)
	// Only a never-reported account sees the setup rail, so this extra query costs
	// nothing once data is flowing.
	const setup = accounts.some(a => a.dash.connected) ? null : await setupState(user.id)
	return { accounts, history, setup }
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
	const { accounts, history, setup } = Route.useLoaderData()
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
						account={multi ? (dash.accountLabel ?? 'Unidentified account') : undefined}
					/>
				) : null,
			)}
			{history.rows.length > 0 && <UsageExplorer history={history} />}
		</>
	)
}
