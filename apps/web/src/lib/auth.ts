import { stripe as stripePlugin } from '@better-auth/stripe'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { lastLoginMethod, username } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import Stripe from 'stripe'
import { db } from '../db'
import * as schema from '../db/schema'
import { accountPlan } from './billing'
import { signupEnabled } from './flags'
import { PAID_PLANS, PLANS } from './plans'

// better-auth only WARNS on a short secret; enforce it. The secret signs/encrypts
// session data, so a weak one silently weakens session integrity. Vite only
// bundles this module at build time (it never executes it, unlike `next build`),
// so the check can run unconditionally in production.
const secret = process.env.BETTER_AUTH_SECRET
if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
	throw new Error('BETTER_AUTH_SECRET must be set to at least 32 characters in production')
}

// Mandatory on any deployment, hosted or self-hosted: OAuth because both
// provider buttons are always offered, Stripe because the upgrade flow reaches
// it from the free tier. A missing variable is a production error, not a warning.
export function requiredEnv(name: string): string {
	const value = process.env[name]
	if (value) {
		return value
	}
	if (process.env.NODE_ENV === 'production') {
		throw new Error(`${name} is not set`)
	}
	return `unset-${name}`
}

/** One client for the whole server: better-auth drives subscriptions with it,
 *  lib/stripe-prices.ts reads the price list from it. */
export const stripe = new Stripe(requiredEnv('STRIPE_SECRET_KEY'))

/** Resend's REST API is one POST, so it needs no SDK. Every mail here carries a
 *  link that grants access, which is why a rejected send must not pass quietly:
 *  better-auth catches and logs whatever this throws, so the failure lands in
 *  the server log instead of leaving someone waiting on a link that was never
 *  accepted. Resend's own `message` is the only thing that distinguishes a bad
 *  MAIL_FROM from an unverified domain from a rejected recipient, so it goes
 *  into the error; the recipient never does. */
async function sendMail(to: string, subject: string, text: string) {
	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${requiredEnv('RESEND_API_KEY')}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({ from: requiredEnv('MAIL_FROM'), to, subject, text }),
	})
	if (!response.ok) {
		const reason = await response
			.json()
			.then(body => (body as { message?: string }).message)
			.catch(() => undefined)
		throw new Error(`Resend rejected "${subject}": ${response.status}${reason ? ` ${reason}` : ''}`)
	}
}

export const auth = betterAuth({
	secret,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema,
	}),
	// Three ways in: GitHub, Google, and email + password.
	// disableSignUp rejects unknown users server-side (real enforcement, not just
	// UI), so ALLOW_SIGNUP=false has to be set on every method, not one.
	// Signing in with a second provider links onto the existing account only if
	// BOTH emails are verified: the incoming provider must report the address
	// verified (neither provider here is in trustedProviders), and the existing
	// row must have emailVerified set, because requireLocalEmailVerified defaults
	// to true. Anything else gets account_not_linked, which login.tsx explains.
	// That second condition is also why accounts from the password-only era need
	// drizzle/0013_link_legacy_logins.sql: it never ran a verification step, so
	// those rows would fail the check and could never link a provider.
	//
	// requireEmailVerification is what keeps that linking honest for new accounts:
	// without a confirmation step, anyone could register a password account on a
	// stranger's address and then absorb their provider login.
	//
	// revokeSessionsOnPasswordReset is the point of a reset: whoever prompted it
	// has to be able to push out a session they no longer control.
	emailAndPassword: {
		enabled: true,
		disableSignUp: !signupEnabled(),
		requireEmailVerification: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: ({ user, url }) =>
			sendMail(
				user.email,
				'Reset your password',
				`Set a new UsageFleet password:\n\n${url}\n\nThe link expires in an hour and signs out every other session. If you did not ask for this, ignore this email; your password stays as it is.`,
			),
	},

	// The confirmation step behind requireEmailVerification. sendOnSignIn covers
	// the lost-email case on its own: an unverified sign-in attempt is refused AND
	// mails a fresh link, so there is nothing for a "resend" button to do.
	emailVerification: {
		sendOnSignUp: true,
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: ({ user, url }) =>
			sendMail(
				user.email,
				'Confirm your email',
				`Confirm this address to finish signing in to UsageFleet:\n\n${url}\n\nThe link expires in an hour. If you did not sign up, ignore this email.`,
			),
	},

	// Last resort for failures that arrive with no callback URL to return to (an
	// expired OAuth state cookie, a hand-typed endpoint). Without it better-auth
	// serves its own bare /api/auth/error page; /login at least reads ?error=.
	onAPIError: { errorURL: '/login' },
	socialProviders: {
		github: {
			clientId: requiredEnv('GITHUB_CLIENT_ID'),
			clientSecret: requiredEnv('GITHUB_CLIENT_SECRET'),
			disableSignUp: !signupEnabled(),
		},
		google: {
			clientId: requiredEnv('GOOGLE_CLIENT_ID'),
			clientSecret: requiredEnv('GOOGLE_CLIENT_SECRET'),
			disableSignUp: !signupEnabled(),
		},
	},
	user: {
		deleteUser: {
			enabled: true,
			// Removing the user row cascades to devices, groups, usage and the local
			// subscription row, but nothing here can cancel the subscription in
			// Stripe — so deleting mid-plan would keep charging a card for an account
			// that no longer exists. Refuse instead, and let billing.tsx cancel first.
			// This lives in the hook rather than the settings UI because /delete-user
			// is reachable directly with any valid session.
			beforeDelete: async user => {
				const { plan } = await accountPlan(user.id)
				if (plan !== 'free') {
					throw new APIError('BAD_REQUEST', {
						message: 'Cancel your subscription before deleting your account.',
					})
				}
			},
		},
	},
	plugins: [
		// Adds /sign-in/username next to /sign-in/email. The default validator only
		// accepts [a-zA-Z0-9_.], so a username can never contain '@' — which is what
		// lets the login form pick an endpoint by looking for one, with no ambiguous
		// case in between. Usernames are stored lowercased and unique;
		// displayUsername keeps the typed casing.
		username(),
		// Records the last successful method in a readable cookie, so the login page
		// can mark it. The built-in resolver knows /sign-in/email but not the
		// username endpoint the plugin above adds; both are the same credentials
		// form, so both report "email". Returning null falls through to the default.
		lastLoginMethod({
			customResolveMethod: ctx => (ctx.path === '/sign-in/username' ? 'email' : null),
		}),
		stripePlugin({
			stripeClient: stripe,
			stripeWebhookSecret: requiredEnv('STRIPE_WEBHOOK_SECRET'),
			// A customer up front keeps checkout and the billing portal one call away.
			createCustomerOnSignUp: true,
			subscription: {
				enabled: true,
				plans: PAID_PLANS.map(id => ({
					name: id,
					priceId: requiredEnv(PLANS[id].priceIdEnv),
				})),
			},
		}),
		// Must be last; forwards better-auth's Set-Cookie through the Start response.
		tanstackStartCookies(),
	],
})

export type Auth = typeof auth
