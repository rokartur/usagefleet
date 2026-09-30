import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { useTranslations } from 'use-intl'
import { AutoRefresh } from '@/components/AutoRefresh'
import { Cockpit } from '@/components/dashboard/Cockpit'
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
	const { email, accounts, history, projects } = Route.useLoaderData()
	return (
		<>
			<p className='text-sm text-muted-foreground'>
				{t.rich('viewing', { email, mark: chunks => <span className='text-foreground'>{chunks}</span> })}{' '}
				<Link to='/admin' className='underline underline-offset-2'>
					{t('back')}
				</Link>
			</p>
			{/* The loader is this page's only feed: a frozen snapshot would read "collector offline" 15 min in. */}
			<AutoRefresh intervalMs={60_000} />
			{/* poll off: /api/dashboard answers for the viewer, not this user. */}
			<Cockpit
				accounts={accounts}
				history={history}
				projects={projects}
				setup={null}
				poll={false}
				readOnly
				notConnected={<p className='text-sm text-muted-foreground'>{t('noUsage')}</p>}
			/>
		</>
	)
}
