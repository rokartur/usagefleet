import type { PaidPlan } from './plans'

/** Where a sign-in attempt should land, given the plan a pricing CTA carried in.
 *
 *  `errorCallbackURL` must never contain an `error` param of its own: better-auth
 *  appends `error=<code>` to whatever it is handed, and two `error` keys decode
 *  to an array, which silently defeats the narrowing on the login page and
 *  leaves a failed sign-in with no message at all. */
export function signInRedirects(plan?: PaidPlan) {
	return {
		callbackURL: plan ? `/billing?plan=${plan}` : '/dashboard',
		errorCallbackURL: plan ? `/login?plan=${plan}` : '/login',
	}
}
