import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { signIn, signUp } from '@/lib/auth-client'
import type { PaidPlan } from '@/lib/plans'

/** Email + password, the third way in beside the two provider buttons.
 *
 *  `plan` mirrors OAuthSignIn: a pricing CTA that carried a plan through
 *  sign-in still lands on billing instead of the dashboard. Where to go is
 *  decided here rather than taken from a caller, so no caller can redirect
 *  somewhere else. */
export function AuthForm({ mode, plan }: { mode: 'login' | 'signup'; plan?: PaidPlan }) {
	const router = useRouter()
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)
	const isSignup = mode === 'signup'

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		setError(null)
		const form = new FormData(event.currentTarget)
		const email = String(form.get('email'))
		const password = String(form.get('password'))
		const name = String(form.get('name') ?? '')
		const result = isSignup
			? await signUp.email({ email, password, name: name || email })
			: await signIn.email({ email, password })

		if (result.error) {
			setPending(false)
			setError(result.error.message ?? 'Something went wrong. Try again.')
			return
		}
		// The session cookie only exists after the call above, so every loader that
		// asked "is anyone signed in?" has to run again before navigating.
		await router.invalidate()
		await (plan ? router.navigate({ to: '/billing', search: { plan } }) : router.navigate({ to: '/dashboard' }))
	}

	return (
		<form onSubmit={onSubmit}>
			<FieldGroup>
				{isSignup && (
					<Field>
						<FieldLabel htmlFor='name'>Name</FieldLabel>
						<Input id='name' name='name' autoComplete='name' placeholder='Your name' />
					</Field>
				)}
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
				<Field>
					<FieldLabel htmlFor='password'>Password</FieldLabel>
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
				<Button type='submit' size='lg' disabled={pending}>
					{pending ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in with email'}
				</Button>
			</FieldGroup>
		</form>
	)
}
