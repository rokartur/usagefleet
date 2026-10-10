import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { useTranslations } from 'use-intl'
import { ActionForm } from '@/components/ActionForm'
import { Badge } from '@/components/arc/badge/badge'
import { Button, buttonClassName } from '@/components/arc/button/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/arc/dialog/dialog'
import { Input } from '@/components/arc/input/input'
import { SortableDataTable } from '@/components/arc/sortable-data-table/sortable-data-table'
import { RelativeTime } from '@/components/RelativeTime'
import { db } from '@/db'
import { devices, subscription, user, userSettings } from '@/db/schema'
import { assertDeletable } from '@/lib/auth'
import { ENTITLING_STATUSES } from '@/lib/billing'
import { ensureSettings } from '@/lib/data'
import { isAdminEmail } from '@/lib/flags'
import { FREE_DEVICES, isPaidPlan, PLANS, parseFreeDeviceLimit, planDevices, planLabel } from '@/lib/plans'
import type { PlanId } from '@/lib/plans'
import { requireAdmin } from '@/lib/session'

/** Newest accounts first, capped: this is an operator list, not a CRM. */
const LIST_LIMIT = 200

/** Every account with the two numbers an operator actually needs: what they pay
 *  for and what they use. Three flat queries joined in memory rather than one
 *  per user — accountPlan() is per-account by design and would be N+1 here. */
const adminData = createServerFn().handler(async () => {
	await requireAdmin()
	const [accounts, deviceCounts, subs] = await Promise.all([
		db
			.select({
				createdAt: user.createdAt,
				email: user.email,
				emailVerified: user.emailVerified,
				freeDeviceLimit: userSettings.freeDeviceLimit,
				id: user.id,
				username: user.displayUsername,
			})
			.from(user)
			.leftJoin(userSettings, eq(userSettings.userId, user.id))
			.orderBy(desc(user.createdAt))
			.limit(LIST_LIMIT),
		db
			.select({ n: sql<number>`count(*)::int`, userId: devices.userId })
			.from(devices)
			.where(eq(devices.revoked, false))
			.groupBy(devices.userId),
		db
			.select({ plan: subscription.plan, referenceId: subscription.referenceId, seats: subscription.seats })
			.from(subscription)
			.where(inArray(subscription.status, ENTITLING_STATUSES))
			.orderBy(desc(subscription.periodEnd)),
	])

	const active = new Map(deviceCounts.map(row => [row.userId, row.n]))
	// Ordered by periodEnd desc, so the first row per user is the one
	// accountPlan() would have picked.
	const paid = new Map<string, { plan: PlanId; seats: number | null }>()
	for (const row of subs) {
		if (isPaidPlan(row.plan) && !paid.has(row.referenceId)) {
			paid.set(row.referenceId, { plan: row.plan, seats: row.seats })
		}
	}

	return accounts.map(a => {
		const sub = paid.get(a.id)
		const plan: PlanId = sub?.plan ?? 'free'
		return {
			...a,
			activeDevices: active.get(a.id) ?? 0,
			// Mirrors assertDeletable() so the button only shows where it can work.
			deletable: plan === 'free' && !isAdminEmail(a.email),
			deviceLimit: plan === 'free' ? (a.freeDeviceLimit ?? FREE_DEVICES) : planDevices(plan, sub?.seats ?? null),
			plan,
		}
	})
})

/** Grant (or clear) one account's device allowance while it has no
 *  subscription. Empty input clears the grant back to the catalog default. */
const setFreeDeviceLimit = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		await requireAdmin()
		const userId = String(formData.get('userId'))
		const limit = parseFreeDeviceLimit(String(formData.get('freeDeviceLimit') ?? ''))
		await ensureSettings(userId)
		await db.update(userSettings).set({ freeDeviceLimit: limit }).where(eq(userSettings.userId, userId))
	})

const deleteUser = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		await requireAdmin()
		const [target] = await db
			.select({ email: user.email, id: user.id })
			.from(user)
			.where(eq(user.id, String(formData.get('userId'))))
		if (!target) {
			throw new Error('User not found')
		}
		await assertDeletable(target)
		// Sessions, devices, groups and usage all cascade from the user row.
		await db.delete(user).where(eq(user.id, target.id))
	})

export const Route = createFileRoute('/_dash/admin')({
	loader: () => adminData(),
	component: AdminPage,
})

function AdminPage() {
	const t = useTranslations('dash.admin')
	const tActions = useTranslations('dash.actions')
	const accounts = Route.useLoaderData()
	return (
		<>
			<p className='text-sm text-muted-foreground'>
				{t('lead', { count: accounts.length, fallback: FREE_DEVICES })}
			</p>
			<SortableDataTable
				rows={accounts}
				rowKey='id'
				defaultSort={{ direction: 'desc', key: 'createdAt' }}
				columns={[
					{
						key: 'email',
						label: t('account'),
						sortable: true,
						render: (_, a) => (
							<>
								<span className='font-medium'>{a.email}</span>
								{!a.emailVerified && (
									<Badge tone='warning' size='sm' className='ml-2'>
										{t('unverified')}
									</Badge>
								)}
								{a.username && <p className='text-xs text-muted-foreground'>{a.username}</p>}
							</>
						),
					},
					{
						key: 'createdAt',
						label: t('joined'),
						sortable: true,
						render: (_, a) => (
							<span className='text-muted-foreground'>
								<RelativeTime date={a.createdAt} />
							</span>
						),
					},
					{
						key: 'plan',
						label: t('plan'),
						sortable: true,
						render: (_, a) => (
							<Badge tone={a.plan === 'free' ? 'neutral' : 'info'} size='sm'>
								{planLabel(a.plan)}
							</Badge>
						),
					},
					{
						key: 'activeDevices',
						label: t('devices'),
						numeric: true,
						sortable: true,
						render: (_, a) => (
							<span className={a.activeDevices > a.deviceLimit ? 'text-warning' : undefined}>
								{a.activeDevices} / {a.deviceLimit}
							</span>
						),
					},
					{
						key: 'freeDeviceLimit',
						label: t('freeAllowance'),
						render: (_, a) => (
							<ActionForm
								action={setFreeDeviceLimit}
								className='flex items-center gap-2'
								loadingMessage={t('updating', { email: a.email })}
								successMessage={t('updated', { email: a.email })}
								errorMessage={t('updateFailed', { email: a.email })}
							>
								<input type='hidden' name='userId' value={a.id} />
								{/* The column header already names the field; the label stays for screen readers. */}
								<div className='w-24 [&_label]:sr-only'>
									<Input
										label={t('limitLabel', { email: a.email })}
										defaultValue={a.freeDeviceLimit ?? ''}
										inputMode='numeric'
										max={PLANS.custom.maxDevices}
										min={0}
										name='freeDeviceLimit'
										placeholder={String(FREE_DEVICES)}
										type='number'
									/>
								</div>
								<Button type='submit' variant='secondary' size='sm'>
									{tActions('save')}
								</Button>
							</ActionForm>
						),
					},
					{
						key: 'actions',
						label: '',
						render: (_, a) => (
							<div className='flex gap-2'>
								<Link
									to='/admin/$userId'
									params={{ userId: a.id }}
									className={buttonClassName({ size: 'sm', variant: 'secondary' })}
								>
									{t('view')}
								</Link>
								{a.deletable && (
									<Dialog>
										<DialogTrigger render={<Button variant='danger' size='sm' />}>
											{t('delete')}
										</DialogTrigger>
										<DialogContent
											title={t('deleteTitle', { email: a.email })}
											description={t('deleteDescription')}
										>
											<ActionForm
												action={deleteUser}
												loadingMessage={t('deleting', { email: a.email })}
												successMessage={t('deleted', { email: a.email })}
												errorMessage={t('deleteFailed', { email: a.email })}
											>
												<input type='hidden' name='userId' value={a.id} />
												<div className='flex justify-end gap-2'>
													<DialogClose render={<Button variant='secondary' type='button' />}>
														{tActions('cancel')}
													</DialogClose>
													<DialogClose render={<Button type='submit' variant='danger' />}>
														{t('delete')}
													</DialogClose>
												</div>
											</ActionForm>
										</DialogContent>
									</Dialog>
								)}
							</div>
						),
					},
				]}
			/>
		</>
	)
}
