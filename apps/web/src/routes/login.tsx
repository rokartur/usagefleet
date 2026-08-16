import { useEffect, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AuthForm } from '@/components/AuthForm'
import { OAuthSignIn } from '@/components/OAuthSignIn'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { authClient } from '@/lib/auth-client'
import { signupEnabled } from '@/lib/flags'
import { isPaidPlan } from '@/lib/plans'
import type { PaidPlan } from '@/lib/plans'
import { getSession } from '@/lib/session'
import { SITE_NAME } from '@/lib/site'

/** Signed-in visitors skip the form; ALLOW_SIGNUP is a server-side flag, so the
 *  "new accounts are off" notice has to be resolved on the server too. */
const loginPage = createServerFn().handler(async () => {
	if (await getSession()) {
		throw redirect({ to: '/dashboard' })
	}
	return { signupEnabled: signupEnabled() }
})

/** Both params come from a URL, so neither is trusted. `plan` is dropped unless
 *  it names a plan we still sell, otherwise a crafted ?plan= would ride through
 *  to /billing. `error` is only ever compared or counted, never rendered, so it
 *  is kept as an opaque string — better-auth picks the code (signup_disabled,
 *  account_not_linked, access_denied, ...) and that list is not ours to fix.
 *  A repeated ?error= decodes to an array rather than a string, which is how an
 *  earlier version silently rendered no message at all; take the first entry so
 *  the page degrades to a generic error instead of to silence. */
function validateSearch(search: Record<string, unknown>): {
	error?: string
	plan?: PaidPlan
} {
	const error = Array.isArray(search.error) ? search.error[0] : search.error
	return {
		error: typeof error === 'string' ? error : undefined,
		plan: typeof search.plan === 'string' && isPaidPlan(search.plan) ? search.plan : undefined,
	}
}

export const Route = createFileRoute('/login')({
	validateSearch,
	loader: () => loginPage(),
	// robots.txt keeps crawlers off the app itself, but this page answers 200 to
	// anyone, and a sign-in form is not a search result worth having.
	head: () => ({
		meta: [{ title: `Sign in — ${SITE_NAME}` }, { name: 'robots', content: 'noindex, nofollow' }],
	}),
	component: LoginPage,
})

function LoginPage() {
	const { signupEnabled } = Route.useLoaderData()
	const { error, plan } = Route.useSearch()
	// Both modes share this page: the providers sign up and sign in with the same
	// button, only the password form needs to know which one the visitor wants.
	const [mode, setMode] = useState<'login' | 'signup'>('login')
	const isSignup = mode === 'signup'
	// The last-login-method plugin leaves a plain cookie, readable only in the
	// browser, so reading it while rendering would make the server markup and the
	// first client render disagree. Read once here rather than per button.
	const [lastMethod, setLastMethod] = useState<string | null>(null)
	useEffect(() => {
		// oxlint-disable-next-line react/react-compiler -- document.cookie is only readable after mount
		setLastMethod(authClient.getLastUsedLoginMethod())
	}, [])
	return (
		<div className='flex flex-1 items-center justify-center p-6'>
			<Card className='w-full max-w-sm [--card-spacing:--spacing(6)]'>
				<CardHeader>
					<CardTitle className='text-lg'>{isSignup ? 'Create account' : 'Sign in'}</CardTitle>
					<CardDescription>Track usage across groups and devices.</CardDescription>
				</CardHeader>
				<CardContent className='flex flex-col gap-6'>
					<div className='flex flex-col gap-2'>
						<OAuthSignIn provider='github' size='lg' plan={plan} lastUsed={lastMethod === 'github'} />
						<OAuthSignIn
							provider='google'
							size='lg'
							variant='outline'
							plan={plan}
							lastUsed={lastMethod === 'google'}
						/>
					</div>
					<div className='flex items-center gap-3 text-xs text-muted-foreground'>
						<Separator className='flex-1' />
						or
						<Separator className='flex-1' />
					</div>
					<AuthForm mode={mode} plan={plan} lastUsed={lastMethod === 'email'} />
					{error && (
						<p role='alert' className='text-center text-sm text-destructive'>
							{error === 'signup_disabled'
								? 'That account does not exist here, and new accounts are turned off.'
								: error === 'account_not_linked'
									? 'That email already signed up a different way. Use the method you started with.'
									: 'Sign-in failed. Try again.'}
						</p>
					)}
					{signupEnabled ? (
						<button
							type='button'
							onClick={() => setMode(isSignup ? 'login' : 'signup')}
							className='text-center text-sm text-muted-foreground'
						>
							{isSignup ? 'Already have an account? ' : 'No account? '}
							<span className='font-medium text-foreground underline underline-offset-4'>
								{isSignup ? 'Sign in' : 'Create one'}
							</span>
						</button>
					) : (
						!error && (
							<p className='text-center text-sm text-muted-foreground'>
								New accounts are turned off on this instance.
							</p>
						)
					)}
				</CardContent>
			</Card>
		</div>
	)
}
