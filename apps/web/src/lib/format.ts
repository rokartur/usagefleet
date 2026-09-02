export function formatTokens(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(2)}M`
	}
	if (n >= 1000) {
		return `${(n / 1000).toFixed(1)}k`
	}
	// Rounded because counters tween through fractions, and a token is a token.
	return String(Math.round(n))
}

export function formatUsd(n: number): string {
	if (n === 0) {
		return '$0'
	}
	if (n < 0.01) {
		return '<$0.01'
	}
	return `$${n.toFixed(2)}`
}

/** How long ago, in the coarsest unit that still says something: "42 minutes
 *  ago", "3 days ago". Intl owns the wording, so a locale that inflects the
 *  unit (Polish: "2 minuty" vs "5 minut") gets it right without a string table.
 *
 *  Reads the wall clock, so it cannot be rendered on both sides of hydration:
 *  the server and the hydration pass seconds later can straddle a minute
 *  boundary. Reach for `<RelativeTime>` when the result goes into the DOM. */
export function formatRelative(d: Date | string, locale: string): string {
	const date = typeof d === 'string' ? new Date(d) : d
	const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
	const min = Math.floor((Date.now() - date.getTime()) / 60_000)
	if (min < 1) {
		// numeric:'auto' turns 0 into the idiomatic "now" / "teraz".
		return fmt.format(0, 'minute')
	}
	if (min < 60) {
		return fmt.format(-min, 'minute')
	}
	const h = Math.floor(min / 60)
	return h < 24 ? fmt.format(-h, 'hour') : fmt.format(-Math.floor(h / 24), 'day')
}

export const OS_LABEL: Record<string, string> = {
	linux: 'Linux',
	mac: 'macOS',
	windows: 'Windows',
}
