import { useMounted } from '@/hooks/use-mounted'
import { formatRelative } from '@/lib/format'

/** "42m ago", rendered only once the client owns the tree.
 *
 *  `formatRelative` reads `Date.now()`, so the server and the hydration pass a
 *  few seconds later can land either side of a minute boundary and disagree on
 *  the text. Use this wherever that string reaches the DOM, unless the caller
 *  already gates on `useMounted` itself (as `StatusLine` does).
 *
 *  A missing date needs no clock, so "never" is safe to server-render. */
export function RelativeTime({ date }: { date: Date | string | null }) {
	const mounted = useMounted()
	if (!date) {
		return 'never'
	}
	return mounted ? formatRelative(date) : ''
}
