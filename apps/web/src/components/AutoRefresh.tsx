import { useEffect, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'

/** Periodically re-runs the current route's loaders so pages
 *  (devices last-seen, group counts, …) stay live without a manual reload. */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
	const router = useRouter()
	const lastRefresh = useRef(0)

	useEffect(() => {
		const doRefresh = () => {
			// A loader that throws puts the route in its error boundary, so a dropped
			// connection would replace a rendered dashboard with "something went wrong".
			// Offline: keep what's on screen, the next tick picks it up.
			if (!navigator.onLine) {
				return
			}
			lastRefresh.current = Date.now()
			router.invalidate()
		}
		const id = setInterval(doRefresh, intervalMs)
		const onVisible = () => {
			// Throttle so a focus/visibility burst can't stack refreshes.
			if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current >= intervalMs) {
				doRefresh()
			}
		}
		document.addEventListener('visibilitychange', onVisible)
		return () => {
			clearInterval(id)
			document.removeEventListener('visibilitychange', onVisible)
		}
	}, [router, intervalMs])

	return null
}
