import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
				setError(error.message ?? 'Something went wrong. Try again.')
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
			setError(
				error.code === 'EMAIL_NOT_VERIFIED'
					? 'Confirm your email first. We just sent a new link.'
					: (error.message ?? 'Something went wrong. Try again.'),
			)
			return
		}
		// The session cookie only exists after the call above, so every loader that
		// asked "is anyone signed in?" has to run again before navigating.
		await router.invalidate()
		await (plan ? router.navigate({ to: '/billing', search: { plan } }) : router.navigate({ to: '/dashboard' }))
	}

	if (sent) {
		return (
			<output className='text-sm text-muted-foreground'>
				Check your inbox. Confirming the link finishes the account and signs you in.
			</output>
		)
	}

	return (
		<form onSubmit={onSubmit}>
			<FieldGroup>
				{isSignup ? (
					<>
						<Field>
							<FieldLabel htmlFor='name'>Name</FieldLabel>
							<Input id='name' name='name' autoComplete='name' placeholder='Your name' />
						</Field>
						<Field>
							<FieldLabel htmlFor='username'>Username</FieldLabel>
							{/* Mirrors the server's validator so a typo is caught before the
							    round trip; the server stays the one that decides. */}
							<Input
								id='username'
								name='username'
								required
								minLength={3}
								maxLength={30}
								pattern='[a-zA-Z0-9_.]+'
								title='Letters, digits, dots and underscores'
								autoComplete='username'
								placeholder='yourname'
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor='email'>Email</FieldLabel>
							<Input
								id='email'
								name='email'
								type='email'
								required
								autoComplete='email'
								placeholder='you@example.com'
							/>
						</Field>
					</>
				) : (
					<Field>
						<FieldLabel htmlFor='identifier'>Email or username</FieldLabel>
						<Input
							id='identifier'
							name='identifier'
							required
							autoComplete='username'
							placeholder='you@example.com'
						/>
					</Field>
				)}
				<Field>
					<div className='flex items-center justify-between'>
						<FieldLabel htmlFor='password'>Password</FieldLabel>
						{!isSignup && (
							<Link
								to='/reset-password'
								className='text-sm text-muted-foreground underline underline-offset-4'
							>
								Forgot?
							</Link>
						)}
					</div>
					<Input
						id='password'
						name='password'
						type='password'
						required
						minLength={8}
						autoComplete={isSignup ? 'new-password' : 'current-password'}
						placeholder='At least 8 characters'
					/>
				</Field>
				{error && <FieldError>{error}</FieldError>}
				<Button type='submit' size='lg' disabled={pending} className='relative'>
					{pending ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in with password'}
					{lastUsed && !isSignup && (
						<Badge
							variant='secondary'
							className='absolute -top-2 right-2 h-4.5 px-1.5 text-[10px] font-normal'
						>
							Last used
						</Badge>
					)}
				</Button>
			</FieldGroup>
		</form>
	)
}
