import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { KeyRound } from 'lucide-react'
import { useTranslations } from 'use-intl'
import { ActionForm } from '@/components/ActionForm'
import { DevPlanPanel, PlanSection } from '@/components/billing/PlanSection'
import { PROVIDERS, ProviderMark } from '@/components/OAuthSignIn'
import type { ProviderId } from '@/components/OAuthSignIn'
import { ThemeToggle } from '@/components/theme-toggle'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { db } from '@/db'
import { account } from '@/db/schema'
import { updateCacheTtl } from '@/lib/actions'
import { authClient } from '@/lib/auth-client'
import { accountPlan } from '@/lib/billing'
import { ensureSettings, listDevices } from '@/lib/data'
import { isAdminEmail } from '@/lib/flags'
import { detectLocale, LOCALE_CURRENCY } from '@/lib/i18n'
import { isPaidPlan } from '@/lib/plans'
import type { PaidPlan } from '@/lib/plans'
import { requireUser } from '@/lib/session'
import { planPrices } from '@/lib/stripe-prices'

const accountData = createServerFn().handler(async () => {
	const user = await requireUser()
	const [settings, linked, plan, devices, prices] = await Promise.all([
		ensureSettings(user.id),
		db.select({ id: account.id, providerId: account.providerId }).from(account).where(eq(account.userId, user.id)),
		accountPlan(user.id),
		listDevices(user.id),
		planPrices(LOCALE_CURRENCY[detectLocale()]),
	])
	return {
		settings,
		email: user.email,
		connected: linked,
		plan,
		prices,
		activeDevices: devices.filter(d => !d.revoked).length,
		isAdmin: isAdminEmail(user.email),
	}
})

/** Both params are URL input. `plan` arrives from a landing-page pricing CTA that
 *  survived sign-in, so it only highlights a row after being narrowed to a real
 *  plan. `error` comes back from an OAuth redirect and is only ever compared,
 *  never rendered: better-auth owns the code list (email_doesn't_match,
 *  account_already_linked, ...). A repeated ?error= decodes to an array, so take
 *  the first entry rather than falling through to no message at all. */
function validateSearch(search: Record<string, unknown>): { plan?: PaidPlan; error?: string } {
	const error = Array.isArray(search.error) ? search.error[0] : search.error
	return {
		plan: typeof search.plan === 'string' && isPaidPlan(search.plan) ? search.plan : undefined,
		error: typeof error === 'string' ? error : undefined,
	}
}

export const Route = createFileRoute('/_dash/account')({
	validateSearch,
	loader: () => accountData(),
	component: AccountPage,
})

/** Billing and settings on one page, one ruled row per topic. */
function AccountPage() {
	const t = useTranslations('dash.settings')
	const tBilling = useTranslations('billing')
	const tActions = useTranslations('dash.actions')
	const { settings, email, connected, plan, prices, activeDevices, isAdmin } = Route.useLoaderData()
	const { plan: preselected, error } = Route.useSearch()
	const ttls = [
		{ value: '5m', label: t('cacheTtl5m') },
		{ value: '1h', label: t('cacheTtl1h') },
	]

	return (
		<div className='flex flex-col gap-10'>
			<Section id='plan' title={tBilling('current.label')}>
				<PlanSection plan={plan} prices={prices} activeDevices={activeDevices} preselected={preselected} />
			</Section>

			{import.meta.env.DEV && (
				<Section title={tBilling('dev.title')} description={tBilling('dev.lead')}>
					<DevPlanPanel plan={plan} />
				</Section>
			)}

			<Section title={t('pricing')} description={t('pricingDescription')}>
				<ActionForm action={updateCacheTtl} loadingMessage={t('saving')} successMessage={t('saved')}>
					<Field orientation='responsive'>
						<FieldContent>
							<FieldLabel htmlFor='cacheWriteTtl'>{t('cacheTtl')}</FieldLabel>
							<FieldDescription>{t('cacheTtlDescription')}</FieldDescription>
						</FieldContent>
						<div className='flex items-center gap-2'>
							<Select
								key={settings.cacheWriteTtl}
								name='cacheWriteTtl'
								defaultValue={settings.cacheWriteTtl}
								items={ttls}
							>
								<SelectTrigger id='cacheWriteTtl'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ttls.map(ttl => (
										<SelectItem key={ttl.value} value={ttl.value}>
											{ttl.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button type='submit' variant='outline'>
								{tActions('save')}
							</Button>
						</div>
					</Field>
				</ActionForm>
			</Section>

			<Section title={t('appearance')} description={t('appearanceDescription')}>
				<ThemeToggle />
			</Section>

			<Section
				title={t('signInMethods')}
				description={t.rich('signInMethodsDescription', {
					email,
					mark: chunks => <span className='text-foreground'>{chunks}</span>,
				})}
			>
				<SignInMethods email={email} connected={connected} linkError={error} />
			</Section>

			<Section title={t('delete.title')} description={t('delete.description')}>
				<DeleteAccount subscribed={plan.plan !== 'free'} planName={plan.plan} isAdmin={isAdmin} />
			</Section>
		</div>
	)
}

/** Title on the left, the control on the right; stacks below md. */
function Section({
	id,
	title,
	description,
	children,
}: {
	id?: string
	title: string
	description?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<section id={id} className='grid gap-4 border-t pt-5 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10'>
			<div>
				<h2 className='text-sm font-medium'>{title}</h2>
				{description && <p className='mt-1 text-sm text-muted-foreground'>{description}</p>}
			</div>
			<div className='min-w-0'>{children}</div>
		</section>
	)
}

const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

/** Codes better-auth appends to errorCallbackURL when a link attempt fails,
 *  mapped to a message key. Anything unrecognised falls back rather than
 *  leaking a raw code. */
function linkErrorKey(code: string) {
	switch (code.toLowerCase()) {
		case "email_doesn't_match": {
			return 'linkErrorMismatch' as const
		}
		case 'account_already_linked': {
			return 'linkErrorAlreadyLinked' as const
		}
		default: {
			return 'linkErrorGeneric' as const
		}
	}
}

/** Connect/disconnect the ways this account can sign in: the OAuth providers
 *  plus the password.
 *
 *  Linking is deliberately not given a "which email?" choice: better-auth only
 *  attaches a provider whose verified address matches this account's, so the
 *  button either works or reports a mismatch. */
function SignInMethods({
	email,
	connected,
	linkError,
}: {
	email: string
	connected: { id: string; providerId: string }[]
	linkError?: string
}) {
	const t = useTranslations('dash.settings')
	const tActions = useTranslations('dash.actions')
	const router = useRouter()
	const [busy, setBusy] = useState<ProviderId | 'password' | null>(null)
	const linkedCount = connected.filter(row => PROVIDER_IDS.some(id => id === row.providerId)).length
	// better-auth stores a password under the 'credential' provider, so its
	// presence means unlinking the last provider still leaves a way in.
	const hasPassword = connected.some(row => row.providerId === 'credential')

	async function run(provider: ProviderId, op: () => Promise<{ error?: { message?: string } | null }>) {
		setBusy(provider)
		const { error } = await op()
		// A successful link navigates to the provider instead of returning, so only
		// the failure path and unlink ever get here.
		setBusy(null)
		if (error) {
			toast.add({
				title: t('updateFailed'),
				description: error.message ?? tActions('retry'),
				priority: 'high',
			})
			return
		}
		router.invalidate()
	}

	/** Setting a first password and changing an existing one are the same flow:
	 *  a mailed link, so the address still has to be reachable. reset-password
	 *  creates the credential account when there is none yet. */
	async function mailPasswordLink() {
		setBusy('password')
		const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
		setBusy(null)
		toast.add(
			error
				? {
						title: t('mailFailed'),
						description: error.message ?? tActions('retry'),
						priority: 'high',
					}
				: {
						title: t('mailSent'),
						description: t('mailSentHint', { email }),
					},
		)
	}

	return (
		<div>
			{linkError && (
				<p role='alert' className='pb-3 text-sm text-destructive'>
					{t(linkErrorKey(linkError), { email })}
				</p>
			)}
			<div className='flex flex-col divide-y border-y'>
				{PROVIDER_IDS.map(id => {
					const linked = connected.find(row => row.providerId === id)
					const isConnected = linked !== undefined
					const isLast = isConnected && linkedCount === 1 && !hasPassword
					return (
						<div key={id} className='flex items-center justify-between gap-4 py-3'>
							<div className='flex items-center gap-2'>
								<ProviderMark provider={id} />
								<span>{PROVIDERS[id].name}</span>
							</div>
							<div className='flex items-center gap-3'>
								<span className='text-sm text-muted-foreground'>
									{isConnected ? t('connected') : t('notConnected')}
								</span>
								<Button
									variant='outline'
									size='sm'
									disabled={busy !== null || isLast}
									// Removing the only way in would lock the account out for good.
									title={isLast ? t('unlinkLastHint') : undefined}
									onClick={() =>
										run(id, () =>
											linked
												? // better-auth 1.7 unlinks by account row, not by provider.
													authClient.unlinkAccount({ accountId: linked.id })
												: authClient.linkSocial({
														provider: id,
														callbackURL: '/account',
														// Without this the provider bounces failures to
														// better-auth's bare /api/auth/error page.
														errorCallbackURL: '/account',
													}),
										)
									}
								>
									{busy === id ? tActions('working') : isConnected ? t('disconnect') : t('connect')}
								</Button>
							</div>
						</div>
					)
				})}
				<div className='flex items-center justify-between gap-4 py-3'>
					<div className='flex items-center gap-2'>
						<KeyRound aria-hidden='true' className='size-4' />
						<span>{t('password')}</span>
					</div>
					<div className='flex items-center gap-3'>
						<span className='text-sm text-muted-foreground'>{hasPassword ? t('set') : t('notSet')}</span>
						{/* No "remove password": it is the fallback that keeps unlinking
						    the last provider from locking the account out. */}
						<Button variant='outline' size='sm' disabled={busy !== null} onClick={mailPasswordLink}>
							{busy === 'password'
								? tActions('working')
								: hasPassword
									? t('passwordChange')
									: t('passwordSet')}
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

/** Irreversible account deletion, refused while a subscription is live or the
 *  address is an admin one.
 *
 *  Both rules are enforced in auth.ts's beforeDelete hook — this only saves the
 *  user a round-trip. */
function DeleteAccount({ subscribed, planName, isAdmin }: { subscribed: boolean; planName: string; isAdmin: boolean }) {
	const t = useTranslations('dash.settings.delete')
	const tActions = useTranslations('dash.actions')
	const [pending, setPending] = useState(false)

	return (
		<div>
			{isAdmin ? (
				<p className='text-sm text-muted-foreground'>
					{t.rich('adminBlocked', { env: chunks => <span className='text-foreground'>{chunks}</span> })}
				</p>
			) : subscribed ? (
				<p className='text-sm text-muted-foreground'>
					{t.rich('subscribed', {
						cancel: chunks => (
							<a href='#plan' className='text-foreground underline underline-offset-4'>
								{chunks}
							</a>
						),
						mark: chunks => <span className='text-foreground'>{chunks}</span>,
						plan: planName,
					})}
				</p>
			) : (
				<AlertDialog>
					<AlertDialogTrigger render={<Button variant='destructive' disabled={pending} />}>
						{t('title')}
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
							<AlertDialogDescription>{t('confirmDescription')}</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={pending}>{tActions('cancel')}</AlertDialogCancel>
							<AlertDialogAction
								variant='destructive'
								disabled={pending}
								onClick={async event => {
									// Keep the dialog open: on failure the message belongs here,
									// and on success the browser leaves the page anyway.
									event.preventDefault()
									setPending(true)
									const { error } = await authClient.deleteUser()
									if (error) {
										setPending(false)
										toast.add({
											title: t('failed'),
											// better-auth rejects a stale session on sensitive
											// routes, and its message says so.
											description: error.message ?? tActions('retry'),
											priority: 'high',
										})
										return
									}
									// Full reload rather than a router navigation: the session
									// cookie is gone, so every cached loader result is stale.
									window.location.href = '/'
								}}
							>
								{pending ? t('deleting') : t('title')}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	)
}
