import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Minus, Plus } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'use-intl'
import { ActionForm } from '@/components/ActionForm'
import { BillingPortalButton, SubscribeButton } from '@/components/billing/BillingButtons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { accountPlan } from '@/lib/billing'
import type { AccountPlan } from '@/lib/billing'
import { listDevices } from '@/lib/data'
import { devSetPlan } from '@/lib/dev-actions'
import { detectLocale, LOCALE_CURRENCY } from '@/lib/i18n'
import { formatPlanPrice, FREE_DEVICES, isPaidPlan, PAID_PLANS, PLANS, planLabel, planPriceCents } from '@/lib/plans'
import type { PaidPlan, PlanPrices } from '@/lib/plans'
import { requireUser } from '@/lib/session'
import { planPrices } from '@/lib/stripe-prices'
import { cn } from '@/lib/utils'

/** The tiers that sell a fixed device count, free included so the grid does not
 *  special-case it. Custom is priced per device and gets its own row below. */
const TIERS = [
	{ id: 'free', label: 'Free', devices: FREE_DEVICES },
	{ id: 'solo', ...PLANS.solo },
	{ id: 'fleet', ...PLANS.fleet },
] as const

const billingData = createServerFn().handler(async () => {
	const user = await requireUser()
	const [plan, devices, prices] = await Promise.all([
		accountPlan(user.id),
		listDevices(user.id),
		planPrices(LOCALE_CURRENCY[detectLocale()]),
	])
	return {
		plan,
		prices,
		activeDevices: devices.filter(d => !d.revoked).length,
	}
})

export const Route = createFileRoute('/_dash/billing')({
	// ?plan= arrives from a landing-page pricing CTA that survived sign-in. It is
	// URL input, so it only highlights a card after being narrowed to a real plan.
	validateSearch: (search: Record<string, unknown>): { plan?: PaidPlan } => ({
		plan: typeof search.plan === 'string' && isPaidPlan(search.plan) ? search.plan : undefined,
	}),
	loader: () => billingData(),
	component: BillingPage,
})

function BillingPage() {
	const { plan, prices, activeDevices } = Route.useLoaderData()
	const { plan: preselected } = Route.useSearch()
	const locale = useLocale()
	const t = useTranslations('billing')
	const format = useFormatter()
	const subscribed = plan.plan !== 'free'

	return (
		<div className='flex flex-col gap-8'>
			<section>
				<Card>
					<CardHeader className='border-b'>
						<CardDescription>{t('current.label')}</CardDescription>
						<CardTitle className='flex items-center gap-2 text-2xl'>
							{planLabel(plan.plan)}
							{plan.status === 'past_due' && <Badge variant='destructive'>{t('current.pastDue')}</Badge>}
							{plan.cancelAtPeriodEnd && <Badge variant='secondary'>{t('current.cancels')}</Badge>}
						</CardTitle>
						<CardAction className='text-right'>
							<p className='text-2xl font-medium tabular-nums'>
								{formatPlanPrice(planPriceCents(plan.plan, plan.seats, prices), prices, locale)}
								<span className='text-sm font-normal text-muted-foreground'>
									{t('current.perMonth')}
								</span>
							</p>
							{plan.periodEnd && (
								<p className='text-xs text-muted-foreground'>
									{plan.cancelAtPeriodEnd ? t('current.ends') : t('current.renews')}{' '}
									{format.dateTime(plan.periodEnd, { dateStyle: 'medium' })}
								</p>
							)}
						</CardAction>
					</CardHeader>

					<CardContent>
						<DeviceMeter used={activeDevices} limit={plan.deviceLimit} />
					</CardContent>

					{subscribed && (
						<CardFooter className='border-t'>
							<BillingPortalButton />
						</CardFooter>
					)}
				</Card>
			</section>

			<section>
				<h2 className='font-heading text-base font-medium'>{t('change.title')}</h2>
				<p className='mt-1 mb-4 text-sm text-muted-foreground'>{t('change.lead')}</p>

				<div className='grid gap-3 sm:grid-cols-3'>
					{TIERS.map(tier => {
						const current = plan.plan === tier.id
						return (
							<Card
								key={tier.id}
								size='sm'
								className={cn(
									'gap-3',
									current && 'ring-2 ring-foreground/20',
									preselected === tier.id && !current && 'ring-2 ring-primary',
								)}
							>
								<CardHeader>
									<CardTitle className='flex items-center justify-between gap-2'>
										{tier.label}
										{current && <Badge variant='secondary'>{t('change.current')}</Badge>}
									</CardTitle>
									<CardDescription className='text-xl font-medium text-foreground tabular-nums'>
										{formatPlanPrice(planPriceCents(tier.id, null, prices), prices, locale)}
										<span className='text-sm font-normal text-muted-foreground'>
											{t('current.perMonth')}
										</span>
									</CardDescription>
								</CardHeader>
								<CardContent className='text-sm text-muted-foreground'>
									{t('change.devices', { count: tier.devices })}
								</CardContent>
								<CardFooter>
									<TierAction tier={tier} current={current} subscribed={subscribed} />
								</CardFooter>
							</Card>
						)
					})}
				</div>

				<CustomTier
					current={plan.plan === 'custom'}
					seats={plan.seats}
					prices={prices}
					subscribed={subscribed}
					preselected={preselected === 'custom'}
				/>
			</section>

			{import.meta.env.DEV && <DevPlanPanel plan={plan} />}
		</div>
	)
}

/** Local plan switching, so plan gates and the device cap can be exercised
 *  without a card. `import.meta.env.DEV` is a compile-time constant, so this
 *  subtree is dropped from production bundles — the real guard is the one in
 *  `devSetPlan`, which is what actually refuses to run there. */
function DevPlanPanel({ plan }: { plan: AccountPlan }) {
	const t = useTranslations('billing.dev')

	return (
		<section>
			<h2 className='font-heading text-base font-medium'>{t('title')}</h2>
			<p className='mt-1 mb-4 text-sm text-muted-foreground'>{t('lead')}</p>

			<Card size='sm' className='gap-3 border-dashed'>
				<CardContent className='flex flex-wrap items-end gap-x-4 gap-y-3'>
					<ActionForm
						action={devSetPlan}
						loadingMessage={t('applying')}
						successMessage={t('planApplied')}
						className='flex flex-wrap items-end gap-3'
					>
						<label className='flex flex-col gap-1.5 text-xs text-muted-foreground'>
							{t('plan')}
							<select
								name='plan'
								defaultValue={plan.plan}
								className='h-9 rounded-md border bg-transparent px-2 text-sm text-foreground'
							>
								<option value='free'>free</option>
								{PAID_PLANS.map(id => (
									<option key={id} value={id}>
										{id}
									</option>
								))}
							</select>
						</label>

						<label htmlFor='dev-devices' className='flex flex-col gap-1.5 text-xs text-muted-foreground'>
							{t('devices')}
							<Input
								id='dev-devices'
								type='number'
								name='devices'
								min={0}
								defaultValue={plan.seats ?? PLANS.custom.minDevices}
								className='h-9 w-24 tabular-nums'
							/>
						</label>

						<Button type='submit' size='sm' variant='outline'>
							{t('apply')}
						</Button>
					</ActionForm>

					<ActionForm
						action={devSetPlan}
						loadingMessage={t('clearing')}
						successMessage={t('cleared')}
						className='ms-auto'
					>
						<input type='hidden' name='plan' value='free' />
						<Button type='submit' size='sm' variant='ghost'>
							{t('clear')}
						</Button>
					</ActionForm>
				</CardContent>
			</Card>
		</section>
	)
}

/** Custom bills per device, so the device count is the control rather than a
 *  fact about the tier. Editing it while already on custom is the same upgrade
 *  call with a new quantity, which is why the button is live on the current
 *  plan here and disabled everywhere else. */
function CustomTier({
	current,
	seats,
	prices,
	subscribed,
	preselected,
}: {
	current: boolean
	seats: number | null
	prices: PlanPrices
	subscribed: boolean
	preselected: boolean
}) {
	const { label, minDevices, maxDevices } = PLANS.custom
	const locale = useLocale()
	const t = useTranslations('billing')
	const [devices, setDevices] = useState(seats ?? minDevices)
	const clamp = (n: number) => Math.min(Math.max(n, minDevices), maxDevices)
	// What a click would actually buy: the field holds whatever is being typed,
	// including an empty string mid-edit, so price and checkout read the clamp.
	const wanted = clamp(devices || minDevices)
	const unchanged = current && wanted === seats

	let actionLabel = t('change.subscribe')
	if (current) {
		actionLabel = t('custom.updateDevices')
	} else if (subscribed) {
		actionLabel = t('change.switch')
	}

	return (
		<Card
			size='sm'
			className={cn(
				'mt-3 gap-3',
				current && 'ring-2 ring-foreground/20',
				preselected && !current && 'ring-2 ring-primary',
			)}
		>
			<CardHeader>
				<CardTitle className='flex items-center justify-between gap-2'>
					{label}
					{current && <Badge variant='secondary'>{t('change.current')}</Badge>}
				</CardTitle>
				<CardDescription>
					{t('custom.lead', {
						price: formatPlanPrice(prices.amounts.custom, prices, locale),
						min: minDevices,
						max: maxDevices,
					})}
				</CardDescription>
			</CardHeader>
			<CardContent className='flex flex-wrap items-center gap-x-4 gap-y-3'>
				<div className='flex items-center gap-1.5'>
					<Button
						variant='outline'
						size='icon'
						className='size-8'
						aria-label={t('custom.fewer')}
						disabled={devices <= minDevices}
						onClick={() => setDevices(clamp(devices - 1))}
					>
						<Minus />
					</Button>
					<Input
						type='number'
						min={minDevices}
						max={maxDevices}
						value={devices}
						aria-label={t('custom.deviceCountLabel')}
						className='w-20 text-center tabular-nums'
						onChange={e => setDevices(Number(e.target.value))}
						// Snapping into range waits for blur instead of fighting the caret
						// on every keystroke.
						onBlur={() => setDevices(wanted)}
					/>
					<Button
						variant='outline'
						size='icon'
						className='size-8'
						aria-label={t('custom.more')}
						disabled={devices >= maxDevices}
						onClick={() => setDevices(clamp(devices + 1))}
					>
						<Plus />
					</Button>
					<span className='ml-1 text-sm text-muted-foreground'>{t('custom.devices')}</span>
				</div>

				<p className='text-xl font-medium tabular-nums'>
					{formatPlanPrice(planPriceCents('custom', wanted, prices), prices, locale)}
					<span className='text-sm font-normal text-muted-foreground'>{t('current.perMonth')}</span>
				</p>

				<div className='ms-auto'>
					<SubscribeButton
						plan='custom'
						seats={wanted}
						label={actionLabel}
						variant={subscribed ? 'outline' : 'default'}
						size='sm'
						disabled={unchanged}
					/>
				</div>
			</CardContent>
		</Card>
	)
}

function TierAction({
	tier,
	current,
	subscribed,
}: {
	tier: (typeof TIERS)[number]
	current: boolean
	subscribed: boolean
}) {
	const t = useTranslations('billing.change')
	if (current) {
		return (
			<Button variant='outline' size='sm' className='w-full' disabled>
				{t('yourPlan')}
			</Button>
		)
	}
	// There is no "downgrade to free" endpoint: cancelling is Stripe's job, and
	// the portal button in the overview card opens it.
	if (tier.id === 'free') {
		return <p className='text-xs text-muted-foreground'>{t('cancelToReturn')}</p>
	}
	return (
		<SubscribeButton
			plan={tier.id}
			label={subscribed ? t('switch') : t('subscribe')}
			variant={subscribed ? 'outline' : 'default'}
			size='sm'
			className='w-full'
		/>
	)
}

/** Past this many slots the segments are thinner than their own gap, so the
 *  meter switches to a plain proportional bar. Custom plans go to 200. */
const MAX_METER_SEGMENTS = 12

/** One segment per device the plan allows. Downgrading does not revoke devices,
 *  so `used` can legitimately exceed `limit` and the meter has to say so. */
function DeviceMeter({ used, limit }: { used: number; limit: number }) {
	const t = useTranslations('billing.meter')
	const free = limit - used
	const overCap = free < 0
	// Three different sentences, because "-2 slots left" is not a sentence.
	let note = t('noSlots')
	if (free > 0) {
		note = t('slotsLeft', { count: free })
	} else if (overCap) {
		note = t('overCap', { count: -free })
	}

	return (
		<div>
			<div className='mb-1.5 flex items-baseline justify-between text-sm'>
				<span className='text-muted-foreground'>{t('active')}</span>
				<span className='tabular-nums'>{t('usedOf', { used, limit })}</span>
			</div>
			{limit <= MAX_METER_SEGMENTS ? (
				<div className='flex gap-1' aria-hidden>
					{Array.from({ length: limit }, (_, slot) => (
						<div
							key={slot}
							className={cn(
								'h-2 flex-1 rounded-sm',
								slot >= used && 'bg-muted',
								slot < used && (overCap ? 'bg-destructive' : 'bg-primary'),
							)}
						/>
					))}
				</div>
			) : (
				<div className='h-2 overflow-hidden rounded-sm bg-muted' aria-hidden>
					<div
						className={cn('h-full rounded-sm', overCap ? 'bg-destructive' : 'bg-primary')}
						style={{ width: `${Math.min(used / limit, 1) * 100}%` }}
					/>
				</div>
			)}
			<p className='mt-2 text-xs text-muted-foreground'>{note}</p>
		</div>
	)
}
