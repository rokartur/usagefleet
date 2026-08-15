import { redirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/flags'

/** Reads the better-auth session from the in-flight request. Server-side only:
 *  call it from a server function, a server route, or a route `beforeLoad` that
 *  runs through one — never from component code. */
export async function getSession() {
	return auth.api.getSession({ headers: getRequest().headers })
}

/** Guard for protected loaders and server functions. Unlike Next's `redirect`,
 *  TanStack's returns the redirect instead of throwing it, so it must be thrown
 *  explicitly or the guard silently passes. */
export async function requireUser() {
	const session = await getSession()
	if (!session) {
		throw redirect({ to: '/login' })
	}
	return session.user
}

/** Guard for the admin panel. Every admin server function calls it — the route
 *  guard only hides the page, it does not protect the mutations behind it.
 *  Non-admins are sent to their own dashboard rather than told a panel exists. */
export async function requireAdmin() {
	const user = await requireUser()
	if (!isAdminEmail(user.email)) {
		throw redirect({ to: '/dashboard' })
	}
	return user
}
