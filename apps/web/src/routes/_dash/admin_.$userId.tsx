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
		return { id: userId, email: target.email, ...(await getDashboardOverview(userId)) }
	})

/** `?compare=<userId>` puts a second user's dashboard beside the first. */
function validateSearch(search: Record<string, unknown>): { compare?: string } {
	return { compare: typeof search.compare === 'string' ? search.compare : undefined }
}

export const Route = createFileRoute('/_dash/admin_/$userId')({
	validateSearch,
	loaderDeps: ({ search }) => ({ compare: search.compare }),
	loader: ({ params, deps }) =>
		Promise.all([params.userId, deps.compare].filter(id => id !== undefined).map(id => viewData({ data: id }))),
	component: AdminUserPage,
})

function AdminUserPage() {
	const t = useTranslations('dash.admin.user')
	const views = Route.useLoaderData()
	return (
		<>
			<Link to='/admin' className='text-sm text-muted-foreground underline underline-offset-2'>
				{t('back')}
			</Link>
			{/* The loader is this page's only feed: a frozen snapshot would read "collector offline" 15 min in. */}
			<AutoRefresh intervalMs={60_000} />
			<div className={views.length > 1 ? 'grid items-start gap-6 lg:grid-cols-2' : undefined}>
				{views.map(({ id, email, accounts, history }) => (
					<section key={id} className='flex min-w-0 flex-col gap-4'>
						<p className='text-sm text-muted-foreground'>
							{t.rich('viewing', {
								email,
								mark: chunks => <span className='text-foreground'>{chunks}</span>,
							})}
						</p>
						{/* poll off: /api/dashboard answers for the viewer, not this user. */}
						<Cockpit
							accounts={accounts}
							history={history}
							setup={null}
							poll={false}
							notConnected={<p className='text-sm text-muted-foreground'>{t('noUsage')}</p>}
						/>
					</section>
				))}
			</div>
		</>
	)
}
