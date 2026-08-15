import type { ComponentProps } from 'react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth-client'
import { signInRedirects } from '@/lib/oauth-redirects'
import type { PaidPlan } from '@/lib/plans'
import { cn } from '@/lib/utils'

/** The two providers that can sign in, next to the email + password form.
 *  lucide-react dropped brand icons, so the marks are inlined. Shared with the
 *  settings page, which lists these same providers as linkable sign-in methods. */
export const PROVIDERS = {
	github: {
		name: 'GitHub',
		path: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z',
	},
	google: {
		name: 'Google',
		path: 'M15.68 8.18c0-.57-.05-1.11-.15-1.64H8v3.09h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.59c1.51-1.39 2.39-3.45 2.39-5.87ZM8 16c2.16 0 3.97-.72 5.29-1.94l-2.59-2c-.72.48-1.63.77-2.7.77-2.08 0-3.84-1.4-4.47-3.29H.87v2.07A8 8 0 0 0 8 16ZM3.53 9.53a4.8 4.8 0 0 1 0-3.07V4.4H.87a8 8 0 0 0 0 7.2l2.66-2.07ZM8 3.17c1.18 0 2.23.41 3.06 1.2l2.29-2.29C11.97.79 10.16 0 8 0A8 8 0 0 0 .87 4.4l2.66 2.07C4.16 4.57 5.92 3.17 8 3.17Z',
	},
} as const

export type ProviderId = keyof typeof PROVIDERS

/** Which provider this browser last signed in with, so a returning visitor does
 *  not have to remember. A hint for the label below, never a source of truth. */
const LAST_PROVIDER_KEY = 'usagefleet.last-provider'

const isProviderId = (value: unknown): value is ProviderId => typeof value === 'string' && value in PROVIDERS

/** Brand mark for a provider, sized to sit inline in a button. */
export function ProviderMark({ provider }: { provider: ProviderId }) {
	return (
		<svg viewBox='0 0 16 16' aria-hidden='true' fill='currentColor' className='size-4'>
			<path d={PROVIDERS[provider].path} />
		</svg>
	)
}

/** Renders one provider button. better-auth redirects away on success, so the
 *  disabled state only has to survive the moment before navigation.
 *
 *  Redirect targets come from signInRedirects(plan) rather than from a caller,
 *  so no caller can turn this button into an open redirect. */
export function OAuthSignIn({
	provider,
	plan,
	...buttonProps
}: Omit<ComponentProps<typeof Button>, 'onClick' | 'children' | 'asChild'> & {
	provider: ProviderId
	/** Plan chosen on the landing page, carried across sign-in so a pricing CTA
	 *  still lands on billing, and survives a failed attempt so a retry works. */
	plan?: PaidPlan
}) {
	const [pending, setPending] = useState(false)
	const [lastUsed, setLastUsed] = useState<ProviderId | null>(null)
	const { name } = PROVIDERS[provider]
	const { callbackURL, errorCallbackURL } = signInRedirects(plan)

	// localStorage exists only in the browser, so reading it while rendering
	// would make the server markup and the first client render disagree.
	useEffect(() => {
		const stored = localStorage.getItem(LAST_PROVIDER_KEY)
		if (isProviderId(stored)) {
			setLastUsed(stored)
		}
	}, [])

	return (
		<Button
			{...buttonProps}
			className={cn('relative', buttonProps.className)}
			disabled={pending || buttonProps.disabled}
			onClick={async () => {
				setPending(true)
				// Recorded on intent rather than on success: a success navigates away
				// before anything after the await is guaranteed to run, so an abandoned
				// attempt marks the provider too.
				localStorage.setItem(LAST_PROVIDER_KEY, provider)
				const { error } = await signIn.social({
					callbackURL,
					errorCallbackURL,
					provider,
				})
				// Only reached when the request never left the browser; a success or a
				// provider-side rejection both navigate away instead.
				if (error) {
					setPending(false)
					// errorCallbackURL never carries an `error` key, so appending one here
					// cannot produce the duplicate that better-auth's own redirect would.
					window.location.href = `${errorCallbackURL}${errorCallbackURL.includes('?') ? '&' : '?'}error=request_failed`
				}
			}}
		>
			<ProviderMark provider={provider} />
			Continue with {name}
			{lastUsed === provider && (
				<Badge variant='secondary' className='absolute -top-2 right-2 h-4.5 px-1.5 text-[10px] font-normal'>
					Last used
				</Badge>
			)}
		</Button>
	)
}
