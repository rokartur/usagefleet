import { stripeClient } from '@better-auth/stripe/client'
import { lastLoginMethodClient, usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// No baseURL → the client calls the same origin it's served from, so the app
// works on any host/port without rebuilding.
// stripeClient adds authClient.subscription.* (upgrade / billingPortal),
// usernameClient adds signIn.username, lastLoginMethodClient adds
// getLastUsedLoginMethod() (reads a plain cookie, so browser-only).
export const authClient = createAuthClient({
	plugins: [stripeClient({ subscription: true }), usernameClient(), lastLoginMethodClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
