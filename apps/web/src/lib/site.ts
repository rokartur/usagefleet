/** Canonical origin of this deployment, without a trailing slash.
 *
 *  On the server it comes from BETTER_AUTH_URL, the same value OAuth callbacks
 *  are built from, so SEO URLs can't drift from the domain the app actually
 *  answers on. In the browser the current origin is already the truth, which
 *  also keeps `head()` producing the same markup on both sides of hydration.
 */
export function siteUrl(): string {
	const origin =
		typeof window === 'undefined'
			? (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000')
			: window.location.origin
	return origin.replace(/\/+$/, '')
}

export const SITE_NAME = 'UsageFleet'

/** Meta description for every page that does not write its own. Kept under 155
 *  characters so Google shows it whole, and phrased with the words people
 *  actually search for: coding agent, token usage, rate limits, machines. */
export const SITE_DESCRIPTION =
	'Track coding agent token usage and rate limits across every machine on one subscription. Live 5-hour and weekly windows, split per device and per group.'

/** Where the project lives in public. Fed to the footer and to the sameAs of
 *  the structured data, which is how a crawler ties the three together. */
export const REPO_URL = 'https://github.com/rokartur/usagefleet'

export const PACKAGE_URL = 'https://www.npmjs.com/package/@usagefleet/cli'
