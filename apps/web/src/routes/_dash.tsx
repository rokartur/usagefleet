import { createFileRoute, Outlet } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AppShell } from '@/components/app-shell'
import { isAdminEmail } from '@/lib/flags'
import { requireUser } from '@/lib/session'

/** Guards every dashboard route and hands the shell what it needs. beforeLoad,
 *  not loader: child loaders wait for it, so a failed guard never runs them. */
const dashShell = createServerFn().handler(async () => {
	const user = await requireUser()
	// Only decides whether the nav link renders; /admin re-checks server-side.
	return { email: user.email, isAdmin: isAdminEmail(user.email) }
})

export const Route = createFileRoute('/_dash')({
	beforeLoad: () => dashShell(),
	component: DashLayout,
})

function DashLayout() {
	const { email, isAdmin } = Route.useRouteContext()
	return (
		<AppShell email={email} isAdmin={isAdmin}>
			<Outlet />
		</AppShell>
	)
}
