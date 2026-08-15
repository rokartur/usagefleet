import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { KeyRound } from 'lucide-react'
import { ActionForm } from '@/components/ActionForm'
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { db } from '@/db'
import { account } from '@/db/schema'
import { updateCacheTtl } from '@/lib/actions'
import { authClient } from '@/lib/auth-client'
import { accountPlan } from '@/lib/billing'
import { ensureSettings } from '@/lib/data'
import { isAdminEmail } from '@/lib/flags'
import { requireUser } from '@/lib/session'

const settingsData = createServerFn().handler(async () => {
	const user = await requireUser()
	const [settings, linked, entitlement] = await Promise.all([
		ensureSettings(user.id),
		db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, user.id)),
		accountPlan(user.id),
	])
	return {
		settings,
		email: user.email,
		connected: linked.map(row => row.providerId),
		entitlement,
		isAdmin: isAdminEmail(user.email),
	}
})

/** `error` comes back from an OAuth redirect, so it is untrusted and only ever
 *  compared, never rendered: better-auth owns the code list (email_doesn't_match,
 *  account_already_linked, ...). A repeated ?error= decodes to an array, so take
 *  the first entry rather than falling through to no message at all. */
function validateSearch(search: Record<string, unknown>): { error?: string } {
	const error = Array.isArray(search.error) ? search.error[0] : search.error
	return { error: typeof error === 'string' ? error : undefined }
}

export const Route = createFileRoute('/_dash/settings')({
	validateSearch,
	loader: () => settingsData(),
	component: SettingsPage,
})

const TTLS = [
	{ value: '5m', label: '5m (1.25× input)' },
	{ value: '1h', label: '1h (2× input)' },
]

function SettingsPage() {
	const { settings, email, connected, entitlement, isAdmin } = Route.useLoaderData()
	const { error } = Route.useSearch()

	return (
		<div className='flex flex-col gap-4'>
			<Card>
				<CardHeader className='border-b'>
					<CardTitle>Pricing</CardTitle>
					<CardDescription>
						Assumptions used to estimate cost at public API list prices, which also decides how each
						group&apos;s share of a limit is split.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ActionForm
						action={updateCacheTtl}
						loadingMessage='Saving pricing settings…'
						successMessage='Pricing settings saved'
					>
						<Field orientation='responsive'>
							<FieldContent>
								<FieldLabel htmlFor='cacheWriteTtl'>Cache-write TTL</FieldLabel>
								<FieldDescription>
									Rate used to price cache writes. Claude Code writes 5m caches unless you set
									ENABLE_PROMPT_CACHING_1H=1.
								</FieldDescription>
							</FieldContent>
							<div className='flex items-center gap-2'>
								<Select
									key={settings.cacheWriteTtl}
									name='cacheWriteTtl'
									defaultValue={settings.cacheWriteTtl}
									items={TTLS}
								>
									<SelectTrigger id='cacheWriteTtl'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TTLS.map(ttl => (
											<SelectItem key={ttl.value} value={ttl.value}>
												{ttl.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button type='submit' variant='outline'>
									Save
								</Button>
							</div>
						</Field>
					</ActionForm>
				</CardContent>
			</Card>

			{/* One control, so it lives in the header rather than paying for a
          content section: CardAction keeps the button at its own width. */}
			<Card>
				<CardHeader>
					<CardTitle>Appearance</CardTitle>
					<CardDescription>Light or dark palette, this browser only.</CardDescription>
					<CardAction>
						<ThemeToggle />
					</CardAction>
				</CardHeader>
			</Card>

			<SignInMethodsCard email={email} connected={connected} linkError={error} />
			<DeleteAccountCard plan={entitlement.plan} isAdmin={isAdmin} />
		</div>
	)
}

const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

/** Codes better-auth appends to errorCallbackURL when a link attempt fails.
 *  Anything unrecognised falls back rather than leaking a raw code. */
function linkErrorMessage(code: string, accountEmail: string): string {
	switch (code.toLowerCase()) {
		case "email_doesn't_match": {
			return `That provider signs in with a different email. Connect the account that uses ${accountEmail}.`
		}
		case 'account_already_linked': {
			return 'That provider account is already connected to another user.'
		}
		default: {
			return 'Could not connect that provider. Please try again.'
		}
	}
}

/** Connect/disconnect the ways this account can sign in: the OAuth providers
 *  plus the password.
 *
 *  Linking is deliberately not given a "which email?" choice: better-auth only
 *  attaches a provider whose verified address matches this account's, so the
 *  button either works or reports a mismatch. */
function SignInMethodsCard({
	email,
	connected,
	linkError,
}: {
	email: string
	connected: string[]
	linkError?: string
}) {
	const router = useRouter()
	const [busy, setBusy] = useState<ProviderId | 'password' | null>(null)
	const linkedCount = PROVIDER_IDS.filter(id => connected.includes(id)).length
	// better-auth stores a password under the 'credential' provider, so its
	// presence means unlinking the last provider still leaves a way in.
	const hasPassword = connected.includes('credential')

	async function run(provider: ProviderId, op: () => Promise<{ error?: { message?: string } | null }>) {
		setBusy(provider)
		const { error } = await op()
		// A successful link navigates to the provider instead of returning, so only
		// the failure path and unlink ever get here.
		setBusy(null)
		if (error) {
			toast.add({
				title: 'Could not update sign-in methods',
				description: error.message ?? 'Please try again.',
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
						title: 'Could not send the link',
						description: error.message ?? 'Please try again.',
						priority: 'high',
					}
				: {
						title: 'Check your email',
						description: `A link to set your password is on its way to ${email}. It expires in an hour.`,
					},
		)
	}

	return (
		<Card className='gap-0'>
			<CardHeader className='border-b'>
				<CardTitle>Sign-in methods</CardTitle>
				<CardDescription>
					Ways to sign in to <span className='text-foreground'>{email}</span>. A provider can only be
					connected while its verified address matches this one.
				</CardDescription>
			</CardHeader>
			{linkError && (
				<p role='alert' className='border-b px-6 py-3 text-sm text-destructive'>
					{linkErrorMessage(linkError, email)}
				</p>
			)}
			<CardContent className='flex flex-col divide-y px-0'>
				{PROVIDER_IDS.map(id => {
					const isConnected = connected.includes(id)
					const isLast = isConnected && linkedCount === 1 && !hasPassword
					return (
						<div key={id} className='flex items-center justify-between gap-4 px-(--card-spacing) py-3.5'>
							<div className='flex items-center gap-2'>
								<ProviderMark provider={id} />
								<span>{PROVIDERS[id].name}</span>
							</div>
							<div className='flex items-center gap-3'>
								<span className='text-sm text-muted-foreground'>
									{isConnected ? 'Connected' : 'Not connected'}
								</span>
								<Button
									variant='outline'
									size='sm'
									disabled={busy !== null || isLast}
									// Removing the only way in would lock the account out for good.
									title={
										isLast
											? 'Connect another provider or set a password before disconnecting this one'
											: undefined
									}
									onClick={() =>
										run(id, () =>
											isConnected
												? authClient.unlinkAccount({ providerId: id })
												: authClient.linkSocial({
														provider: id,
														callbackURL: '/settings',
														// Without this the provider bounces failures to
														// better-auth's bare /api/auth/error page.
														errorCallbackURL: '/settings',
													}),
										)
									}
								>
									{busy === id ? 'Working…' : isConnected ? 'Disconnect' : 'Connect'}
								</Button>
							</div>
						</div>
					)
				})}
				<div className='flex items-center justify-between gap-4 px-(--card-spacing) py-3.5'>
					<div className='flex items-center gap-2'>
						<KeyRound aria-hidden='true' className='size-4' />
						<span>Password</span>
					</div>
					<div className='flex items-center gap-3'>
						<span className='text-sm text-muted-foreground'>{hasPassword ? 'Set' : 'Not set'}</span>
						{/* No "remove password": it is the fallback that keeps unlinking
						    the last provider from locking the account out. */}
						<Button variant='outline' size='sm' disabled={busy !== null} onClick={mailPasswordLink}>
							{busy === 'password' ? 'Working…' : hasPassword ? 'Change' : 'Set password'}
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

/** Irreversible account deletion, refused while a subscription is live or the
 *  address is an admin one.
 *
 *  Both rules are enforced in auth.ts's beforeDelete hook — this card only
 *  saves the user a round-trip. */
function DeleteAccountCard({ plan, isAdmin }: { plan: string; isAdmin: boolean }) {
	const [pending, setPending] = useState(false)
	const subscribed = plan !== 'free'

	return (
		<Card className='ring-destructive/25 dark:ring-destructive/25'>
			<CardHeader className='border-b border-destructive/20'>
				<CardTitle className='text-destructive'>Delete account</CardTitle>
				<CardDescription>
					Removes your devices, groups and every usage record. This cannot be undone.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isAdmin ? (
					<p className='text-sm text-muted-foreground'>
						This address is listed in <span className='text-foreground'>ADMIN_EMAILS</span>. Remove it from
						that list first, deleting the account here would leave the admin panel without a way back in.
					</p>
				) : subscribed ? (
					<p className='text-sm text-muted-foreground'>
						Your <span className='text-foreground'>{plan}</span> subscription is still active.{' '}
						<Link to='/billing' className='text-foreground underline underline-offset-4'>
							Cancel it
						</Link>{' '}
						first, deleting the account here cannot stop Stripe from billing you.
					</p>
				) : (
					<AlertDialog>
						<AlertDialogTrigger render={<Button variant='destructive' disabled={pending} />}>
							Delete account
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete your account?</AlertDialogTitle>
								<AlertDialogDescription>
									Every device, group and usage record is deleted immediately. Collectors still
									running will stop being accepted. This cannot be undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
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
												title: 'Account not deleted',
												// better-auth rejects a stale session on sensitive
												// routes, and its message says so.
												description: error.message ?? 'Please try again.',
												priority: 'high',
											})
											return
										}
										// Full reload rather than a router navigation: the session
										// cookie is gone, so every cached loader result is stale.
										window.location.href = '/'
									}}
								>
									{pending ? 'Deleting…' : 'Delete account'}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				)}
			</CardContent>
		</Card>
	)
}
