import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { OAuthSignIn } from '@/components/OAuthSignIn'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signupEnabled } from '@/lib/flags'
import { isPaidPlan } from '@/lib/plans'
import type { PaidPlan } from '@/lib/plans'
import { getSession } from '@/lib/session'

/** Signed-in visitors skip the button; ALLOW_SIGNUP is a server-side flag, so
 *  the "new accounts are off" notice has to be resolved on the server too. */
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
	component: LoginPage,
})

function LoginPage() {
	const { signupEnabled } = Route.useLoaderData()
	const { error, plan } = Route.useSearch()
	return (
		<div className='flex flex-1 items-center justify-center p-6'>
			<Card className='w-full max-w-sm [--card-spacing:--spacing(6)]'>
				<CardHeader>
					<CardTitle className='text-lg'>Sign in</CardTitle>
					<CardDescription>Track usage across groups and devices.</CardDescription>
				</CardHeader>
				<CardContent className='flex flex-col gap-6'>
					<div className='flex flex-col gap-2'>
						<OAuthSignIn provider='github' size='lg' plan={plan} />
						<OAuthSignIn provider='google' size='lg' variant='outline' plan={plan} />
					</div>
					{error && (
						<p role='alert' className='text-center text-sm text-destructive'>
							{error === 'signup_disabled'
								? 'That account does not exist here, and new accounts are turned off.'
								: error === 'account_not_linked'
									? 'That email already signed up with the other provider. Use that one.'
									: 'Sign-in failed. Try again.'}
						</p>
					)}
					{!signupEnabled && !error && (
						<p className='text-center text-sm text-muted-foreground'>
							New accounts are turned off on this instance.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
