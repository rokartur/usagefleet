// Stands in for @tanstack/react-router inside the video bundle (see
// remotion.config.ts): the dashboard components only link out and read the
// pathname, neither of which needs a router.
import type { AnchorHTMLAttributes } from 'react'

export function Link({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) {
	return (
		<a href={to} {...props}>
			{children}
		</a>
	)
}

const state = { location: { pathname: '/dashboard' } }

export function useRouterState<T>({ select }: { select: (s: typeof state) => T }) {
	return select(state)
}

export function useRouter() {
	return { navigate: () => Promise.resolve() }
}
