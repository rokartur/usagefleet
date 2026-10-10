import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import { Alert } from '@/components/arc/alert/alert'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { PasswordField } from '@/components/arc/password-field/password-field'
import { signIn, signUp } from '@/lib/auth-client'
import { signInRedirects } from '@/lib/oauth-redirects'
import type { PaidPlan } from '@/lib/plans'

/** Credentials, the third way in beside the two provider buttons. Signing in
 *  takes either the email or the username; signing up sets both.
 *
 *  `plan` mirrors OAuthSignIn: a pricing CTA that carried a plan through
 *  sign-in still lands on billing instead of the dashboard. Where to go is
 *  decided here rather than taken from a caller, so no caller can redirect
 *  somewhere else. */
export function AuthForm({
	mode,
	plan,
	lastUsed,
}: {
	mode: 'login' | 'signup'
	plan?: PaidPlan
	/** This browser signed in with credentials last time, so the button says so. */
	lastUsed?: boolean
}) {
	const t = useTranslations('auth.form')
	const router = useRouter()
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)
	const [sent, setSent] = useState(false)
	const isSignup = mode === 'signup'

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		setError(null)
		const form = new FormData(event.currentTarget)
		const password = String(form.get('password'))

		if (isSignup) {
			const email = String(form.get('email'))
			const username = String(form.get('username'))
			const name = String(form.get('name') ?? '')
			// callbackURL is only where the confirmation link lands: with
			// requireEmailVerification on, sign-up never returns a session, so there
			// is nothing to redirect here and now.
			const { error } = await signUp.email({
				email,
				password,
				username,
				name: name || username,
				callbackURL: signInRedirects(plan).callbackURL,
			})
			setPending(false)
			if (error) {
				setError(
					error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
						? t('emailTaken')
						: (error.message ?? t('genericError')),
				)
				return
			}
			setSent(true)
			return
		}

		// The username validator rejects '@', so an identifier containing one can
		// only be an email address: there is no input both lookups could match.
		const identifier = String(form.get('identifier'))
		const { error } = identifier.includes('@')
			? await signIn.email({ email: identifier, password })
			: await signIn.username({ username: identifier, password })

		if (error) {
			setPending(false)
			// The server already mailed a fresh link before refusing (sendOnSignIn),
			// so this is the whole recovery path.
			setError(error.code === 'EMAIL_NOT_VERIFIED' ? t('unverified') : (error.message ?? t('genericError')))
			return
		}
		// Retired matches keep their loader data, so signing into a second account
		// would re-render the previous one's dashboard while the new loader runs in
		// the background. Dropping them makes the next route load blocking, i.e. the
		// pending skeleton instead of another account's numbers.
		router.clearCache()
		// The session cookie only exists after the call above, so every loader that
		// asked "is anyone signed in?" has to run again before navigating.
		await router.invalidate()
		await (plan ? router.navigate({ to: '/account', search: { plan } }) : router.navigate({ to: '/dashboard' }))
	}

	if (sent) {
		return <output className='text-sm text-muted-foreground'>{t('verifySent')}</output>
	}

	return (
		<form onSubmit={onSubmit} className='grid gap-5'>
			{isSignup ? (
				<>
					<Input label={t('name')} name='name' autoComplete='name' placeholder={t('namePlaceholder')} />
					{/* Mirrors the server's validator so a typo is caught before the
					    round trip; the server stays the one that decides. */}
					<Input
						label={t('username')}
						name='username'
						required
						minLength={3}
						maxLength={30}
						pattern='[a-zA-Z0-9_.]+'
						title={t('usernameTitle')}
						autoComplete='username'
						placeholder={t('usernamePlaceholder')}
					/>
					<Input
						label={t('email')}
						name='email'
						type='email'
						required
						autoComplete='email'
						placeholder={t('emailPlaceholder')}
					/>
				</>
			) : (
				<Input
					label={t('identifier')}
					name='identifier'
					required
					autoComplete='username'
					placeholder={t('emailPlaceholder')}
				/>
			)}
			<div className='grid gap-2'>
				<PasswordField
					label={t('password')}
					name='password'
					required
					minLength={8}
					autoComplete={isSignup ? 'new-password' : 'current-password'}
					placeholder={t('passwordPlaceholder')}
					messages={{ hidePassword: t('hidePassword'), showPassword: t('showPassword') }}
				/>
				{!isSignup && (
					<Link
						to='/reset-password'
						className='justify-self-end text-sm text-muted-foreground underline underline-offset-4'
					>
						{t('forgot')}
					</Link>
				)}
			</div>
			{error && <Alert tone='danger' title={error} />}
			{/* The badge sits outside the button: Arc's label slot would anchor it instead. */}
			<div className='relative'>
				<Button type='submit' size='lg' loading={pending} className='w-full'>
					{isSignup ? t('createAccount') : t('signInWithPassword')}
				</Button>
				{lastUsed && !isSignup && (
					<Badge size='sm' className='pointer-events-none absolute -top-2 right-2'>
						{t('lastUsed')}
					</Badge>
				)}
			</div>
		</form>
	)
}
