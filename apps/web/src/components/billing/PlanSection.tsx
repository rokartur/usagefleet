import { useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'use-intl'
import { ActionForm } from '@/components/ActionForm'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { NumberField } from '@/components/arc/number-field/number-field'
import { Progress } from '@/components/arc/progress/progress'
import { Select } from '@/components/arc/select/select'
import { BillingPortalButton, SubscribeButton } from '@/components/billing/BillingButtons'
import type { AccountPlan } from '@/lib/billing'
import { devSetPlan } from '@/lib/dev-actions'
import { formatPlanPrice, FREE_DEVICES, PAID_PLANS, PLANS, planLabel, planPriceCents } from '@/lib/plans'
import type { PaidPlan, PlanPrices } from '@/lib/plans'
import { cn } from '@/lib/utils'

/** The tiers that sell a fixed device count, free included so the list does not
 *  special-case it. Custom is priced per device and gets its own row below. */
const TIERS = [
	{ id: 'free', label: 'Free', devices: FREE_DEVICES },
	{ id: 'solo', ...PLANS.solo },
	{ id: 'fleet', ...PLANS.fleet },
] as const

const ROW = 'flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-3'

export function PlanSection({
	plan,
	prices,
	activeDevices,
	preselected,
}: {
	plan: AccountPlan
	prices: PlanPrices
	activeDevices: number
	/** From a landing-page pricing CTA that survived sign-in; already narrowed. */
	preselected?: PaidPlan
}) {
	const locale = useLocale()
	const t = useTranslations('billing')
	const format = useFormatter()
	const subscribed = plan.plan !== 'free'

	return (
		<div className='flex flex-col gap-6'>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
					<span className='font-heading text-xl font-medium'>{planLabel(plan.plan)}</span>
					<span className='text-sm tabular-nums'>
						{formatPlanPrice(planPriceCents(plan.plan, plan.seats, prices), prices, locale)}
						<span className='text-muted-foreground'>{t('current.perMonth')}</span>
					</span>
					{plan.periodEnd && (
						<span className='text-sm text-muted-foreground'>
							{plan.cancelAtPeriodEnd ? t('current.ends') : t('current.renews')}{' '}
							{format.dateTime(plan.periodEnd, { dateStyle: 'medium' })}
						</span>
					)}
					{plan.status === 'past_due' && <Badge tone='danger'>{t('current.pastDue')}</Badge>}
					{plan.cancelAtPeriodEnd && <Badge tone='warning'>{t('current.cancels')}</Badge>}
				</div>
				{subscribed && <BillingPortalButton />}
			</div>

			<DeviceMeter used={activeDevices} limit={plan.deviceLimit} />

			<div>
				<p className='mb-3 text-sm text-muted-foreground'>{t('change.lead')}</p>
				<ul className='[&>li:last-child]:border-b'>
					{TIERS.map(tier => {
						const current = plan.plan === tier.id
						return (
							<li
								key={tier.id}
								className={cn(ROW, preselected === tier.id && !current && 'bg-muted/40')}
								aria-current={current || undefined}
							>
								<span className='w-20 font-medium'>{tier.label}</span>
								<span className='flex-1 text-sm text-muted-foreground'>
									{t('change.devices', { count: tier.devices })}
								</span>
								<span className='text-sm tabular-nums'>
									{formatPlanPrice(planPriceCents(tier.id, null, prices), prices, locale)}
									<span className='text-muted-foreground'>{t('current.perMonth')}</span>
								</span>
								<div className='flex w-28 justify-end'>
									<TierAction tier={tier} current={current} subscribed={subscribed} />
								</div>
							</li>
						)
					})}
					<CustomTier
						current={plan.plan === 'custom'}
						seats={plan.seats}
						prices={prices}
						subscribed={subscribed}
						preselected={preselected === 'custom'}
					/>
				</ul>
			</div>
		</div>
	)
}

/** Local plan switching, so plan gates and the device cap can be exercised
 *  without a card. `import.meta.env.DEV` is a compile-time constant at the call
 *  site, so this subtree is dropped from production bundles — the real guard is
 *  the one in `devSetPlan`, which is what actually refuses to run there. */
export function DevPlanPanel({ plan }: { plan: AccountPlan }) {
	const t = useTranslations('billing.dev')

	return (
		<div className='flex flex-wrap items-end gap-x-4 gap-y-3'>
			<ActionForm
				action={devSetPlan}
				loadingMessage={t('applying')}
				successMessage={t('planApplied')}
				className='flex flex-wrap items-end gap-3'
			>
				<Select
					label={t('plan')}
					name='plan'
					defaultValue={plan.plan}
					options={['free', ...PAID_PLANS].map(id => ({ label: id, value: id }))}
				/>
				<Input
					label={t('devices')}
					type='number'
					name='devices'
					min={0}
					defaultValue={plan.seats ?? PLANS.custom.minDevices}
					className='w-24 tabular-nums'
				/>
				<Button type='submit' size='sm' variant='secondary'>
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
		</div>
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
	// NumberField keeps the value inside [minDevices, maxDevices], so this is
	// already what a click would buy.
	const [devices, setDevices] = useState(seats ?? minDevices)
	const unchanged = current && devices === seats

	let actionLabel = t('change.subscribe')
	if (current) {
		actionLabel = t('custom.updateDevices')
	} else if (subscribed) {
		actionLabel = t('change.switch')
	}

	return (
		<li className={cn(ROW, preselected && !current && 'bg-muted/40')} aria-current={current || undefined}>
			<span className='w-20 font-medium'>
				{label}
				{current && <span className='sr-only'> ({t('change.current')})</span>}
			</span>
			<div className='flex flex-1 flex-wrap items-center gap-x-4 gap-y-2'>
				{/* The row already names the plan; the label stays for screen readers. */}
				<div className='[&_label]:sr-only'>
					<NumberField
						label={t('custom.deviceCountLabel')}
						value={devices}
						onValueChange={setDevices}
						min={minDevices}
						max={maxDevices}
						size='sm'
						locale={locale}
					/>
				</div>
				<span className='text-xs text-muted-foreground'>
					{t('custom.lead', {
						price: formatPlanPrice(prices.amounts.custom, prices, locale),
						min: minDevices,
						max: maxDevices,
					})}
				</span>
			</div>
			<span className='text-sm tabular-nums'>
				{formatPlanPrice(planPriceCents('custom', devices, prices), prices, locale)}
				<span className='text-muted-foreground'>{t('current.perMonth')}</span>
			</span>
			<div className='flex w-28 justify-end'>
				<SubscribeButton
					plan='custom'
					seats={devices}
					label={actionLabel}
					variant={subscribed ? 'secondary' : 'primary'}
					size='sm'
					disabled={unchanged}
				/>
			</div>
		</li>
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
		return <span className='text-sm text-muted-foreground'>{t('current')}</span>
	}
	// There is no "downgrade to free" endpoint: cancelling is Stripe's job, and
	// the portal button above opens it.
	if (tier.id === 'free') {
		return <span className='text-right text-xs text-muted-foreground'>{t('cancelToReturn')}</span>
	}
	return (
		<SubscribeButton
			plan={tier.id}
			label={subscribed ? t('switch') : t('subscribe')}
			variant={subscribed ? 'secondary' : 'primary'}
			size='sm'
		/>
	)
}

/** Downgrading does not revoke devices, so `used` can legitimately exceed
 *  `limit` and the meter has to say so. */
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
		<div className='max-w-md'>
			<Progress label={t('active')} value={used} max={limit} />
			<p className='mt-2 flex justify-between gap-3 text-xs'>
				<span className={overCap ? 'text-destructive' : 'text-muted-foreground'}>{note}</span>
				<span className='tabular-nums'>{t('usedOf', { used, limit })}</span>
			</p>
		</div>
	)
}
