import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

/** Both halves of a reset live on this one path, because that is what the mail
 *  link forces: better-auth's /reset-password/:token callback checks the token
 *  and bounces here with ?token= or ?error=INVALID_TOKEN. Landing here without
 *  either means the visitor came from the "forgot password" link instead, so
 *  the page asks for an address. `token` is passed straight back to the server,
 *  which is the only thing that can judge it. */
function validateSearch(search: Record<string, unknown>): { token?: string; error?: string } {
	const token = Array.isArray(search.token) ? search.token[0] : search.token
	const error = Array.isArray(search.error) ? search.error[0] : search.error
	return {
		token: typeof token === 'string' ? token : undefined,
		error: typeof error === 'string' ? error : undefined,
	}
}

export const Route = createFileRoute('/reset-password')({
	validateSearch,
	component: ResetPasswordPage,
})

function ResetPasswordPage() {
	const { token, error: linkError } = Route.useSearch()
	return (
		<div className='flex flex-1 items-center justify-center p-6'>
			<Card className='w-full max-w-sm [--card-spacing:--spacing(6)]'>
				<CardHeader>
					<CardTitle className='text-lg'>{token ? 'Choose a new password' : 'Reset password'}</CardTitle>
					<CardDescription>
						{token
							? 'This signs out every other session on the account.'
							: 'We email a link that lets you set a new one.'}
					</CardDescription>
				</CardHeader>
				<CardContent className='flex flex-col gap-6'>
					{linkError && (
						<p role='alert' className='text-sm text-destructive'>
							That link has expired or was already used. Request a new one below.
						</p>
					)}
					{token && !linkError ? <NewPasswordForm token={token} /> : <RequestLinkForm />}
					<Link to='/login' className='text-center text-sm text-muted-foreground'>
						Back to{' '}
						<span className='font-medium text-foreground underline underline-offset-4'>sign in</span>
					</Link>
				</CardContent>
			</Card>
		</div>
	)
}

/** Step one. The server answers the same way whether or not the address exists,
 *  so this must not branch on the result either: telling the two apart here
 *  would hand back the account enumeration better-auth deliberately withholds. */
function RequestLinkForm() {
	const [pending, setPending] = useState(false)
	const [sent, setSent] = useState(false)

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		await authClient.requestPasswordReset({
			email: String(new FormData(event.currentTarget).get('email')),
			redirectTo: '/reset-password',
		})
		setPending(false)
		setSent(true)
	}

	if (sent) {
		return (
			<output className='text-sm text-muted-foreground'>
				If that address has an account, a reset link is on its way. It expires in an hour.
			</output>
		)
	}

	return (
		<form onSubmit={onSubmit}>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor='email'>Email</FieldLabel>
					{/* The username is no use here: only an address can be mailed. */}
					<Input
						id='email'
						name='email'
						type='email'
						required
						autoComplete='email'
						placeholder='you@example.com'
					/>
				</Field>
				<Button type='submit' size='lg' disabled={pending}>
					{pending ? 'Please wait…' : 'Send reset link'}
				</Button>
			</FieldGroup>
		</form>
	)
}

/** Step two, reached only from the mail link. */
function NewPasswordForm({ token }: { token: string }) {
	const router = useRouter()
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		setError(null)
		const { error } = await authClient.resetPassword({
			newPassword: String(new FormData(event.currentTarget).get('password')),
			token,
		})
		setPending(false)
		if (error) {
			setError(error.message ?? 'That link is no longer valid. Request a new one.')
			return
		}
		// Resetting does not sign anyone in, by design: the new password still has
		// to be typed once at the form that knows about usernames and providers.
		await router.navigate({ to: '/login' })
	}

	return (
		<form onSubmit={onSubmit}>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor='password'>New password</FieldLabel>
					<Input
						id='password'
						name='password'
						type='password'
						required
						minLength={8}
						autoComplete='new-password'
						placeholder='At least 8 characters'
					/>
				</Field>
				{error && <FieldError>{error}</FieldError>}
				<Button type='submit' size='lg' disabled={pending}>
					{pending ? 'Please wait…' : 'Set password'}
				</Button>
			</FieldGroup>
		</form>
	)
}
