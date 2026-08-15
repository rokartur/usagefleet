import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { ActionForm } from '@/components/ActionForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { db } from '@/db'
import { devices, subscription, user, userSettings } from '@/db/schema'
import { ENTITLING_STATUSES } from '@/lib/billing'
import { ensureSettings } from '@/lib/data'
import { formatRelative } from '@/lib/format'
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

export const Route = createFileRoute('/_dash/admin')({
	loader: () => adminData(),
	component: AdminPage,
})

function AdminPage() {
	const accounts = Route.useLoaderData()
	return (
		<>
			<p className='text-sm text-muted-foreground'>
				{accounts.length} newest account{accounts.length === 1 ? '' : 's'}. The free allowance applies only while
				an account has no subscription; paid caps come from Stripe. Blank means the default of {FREE_DEVICES}.
			</p>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Account</TableHead>
						<TableHead>Joined</TableHead>
						<TableHead>Plan</TableHead>
						<TableHead className='text-right'>Devices</TableHead>
						<TableHead className='w-52'>Free allowance</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{accounts.map(a => (
						<TableRow key={a.id}>
							<TableCell>
								<span className='font-medium'>{a.email}</span>
								{!a.emailVerified && (
									<Badge variant='outline' className='ml-2 font-normal'>
										unverified
									</Badge>
								)}
								{a.username && <p className='text-xs text-muted-foreground'>{a.username}</p>}
							</TableCell>
							<TableCell className='text-muted-foreground'>{formatRelative(a.createdAt)}</TableCell>
							<TableCell>
								<Badge variant={a.plan === 'free' ? 'outline' : 'secondary'} className='font-normal'>
									{planLabel(a.plan)}
								</Badge>
							</TableCell>
							<TableCell
								className={`text-right tabular-nums ${a.activeDevices > a.deviceLimit ? 'text-amber-600 dark:text-amber-500' : ''}`}
							>
								{a.activeDevices} / {a.deviceLimit}
							</TableCell>
							<TableCell>
								<ActionForm
									action={setFreeDeviceLimit}
									className='flex items-center gap-2'
									loadingMessage={`Updating ${a.email}…`}
									successMessage={`${a.email} updated`}
									errorMessage={`Couldn't update ${a.email}. Please try again.`}
								>
									<input type='hidden' name='userId' value={a.id} />
									<Input
										aria-label={`Free devices for ${a.email}`}
										className='w-20'
										defaultValue={a.freeDeviceLimit ?? ''}
										inputMode='numeric'
										max={PLANS.custom.maxDevices}
										min={0}
										name='freeDeviceLimit'
										placeholder={String(FREE_DEVICES)}
										type='number'
									/>
									<Button type='submit' variant='outline' size='sm'>
										Save
									</Button>
								</ActionForm>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</>
	)
}
