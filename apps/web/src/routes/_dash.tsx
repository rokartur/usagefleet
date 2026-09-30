import { createFileRoute, Outlet } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AppTopbar, PageTitle } from '@/components/app-topbar'
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

/** max-w-7xl matches the marketing pages, so the frame doesn't resize when you
 *  cross from one into the other. */
function DashLayout() {
	const { email, isAdmin } = Route.useRouteContext()
	return (
		<>
			<AppTopbar email={email} isAdmin={isAdmin} />
			<main className='mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6'>
				<PageTitle />
				<Outlet />
			</main>
		</>
	)
}
