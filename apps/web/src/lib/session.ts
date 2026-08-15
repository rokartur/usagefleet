import { redirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/lib/auth'

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
