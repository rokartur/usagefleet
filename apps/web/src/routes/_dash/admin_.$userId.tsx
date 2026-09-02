import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { useTranslations } from 'use-intl'
import { ProjectTable } from '@/components/dashboard/ProjectTable'
import { UsageExplorer } from '@/components/dashboard/UsageExplorer'
import { WindowHistory } from '@/components/dashboard/WindowHistory'
import { LiveDashboard } from '@/components/LiveDashboard'
import { db } from '@/db'
import { user } from '@/db/schema'
import { getDashboardOverview } from '@/lib/data'
import { requireAdmin } from '@/lib/session'

/** One user's dashboard exactly as they see it — same query path as /dashboard,
 *  so an operator debugging "my numbers look wrong" reads the same numbers. */
const viewData = createServerFn()
	.inputValidator(String)
	.handler(async ({ data: userId }) => {
		await requireAdmin()
		const [target] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1)
		if (!target) {
			throw redirect({ to: '/admin' })
		}
		return { email: target.email, ...(await getDashboardOverview(userId)) }
	})

export const Route = createFileRoute('/_dash/admin_/$userId')({
	loader: ({ params }) => viewData({ data: params.userId }),
	component: AdminUserPage,
})

function AdminUserPage() {
	const t = useTranslations('dash.admin.user')
	const tOverview = useTranslations('dash.overview')
	const { email, accounts, history, projects } = Route.useLoaderData()
	const multi = accounts.length > 1
	return (
		<>
			<p className='text-sm text-muted-foreground'>
				{t.rich('viewing', { email, mark: chunks => <span className='text-foreground'>{chunks}</span> })}{' '}
				<Link to='/admin' className='underline underline-offset-2'>
					{t('back')}
				</Link>
			</p>
			{accounts.some(a => a.dash.connected) ? (
				// poll off: /api/dashboard answers for the viewer, not this user.
				<LiveDashboard initial={accounts.map(a => a.dash)} setup={null} poll={false} />
			) : (
				<p className='text-sm text-muted-foreground'>{t('noUsage')}</p>
			)}
			{accounts.map(({ dash, windows }) =>
				windows.sessions.length > 0 || windows.weeks.length > 0 ? (
					<WindowHistory
						key={dash.accountId ?? 'unidentified'}
						history={windows}
						account={multi ? (dash.accountLabel ?? tOverview('unidentifiedAccount')) : undefined}
					/>
				) : null,
			)}
			{projects.length > 0 && <ProjectTable projects={projects} />}
			{history.rows.length > 0 && <UsageExplorer history={history} />}
		</>
	)
}
