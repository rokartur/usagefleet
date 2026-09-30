import { createFileRoute, redirect } from '@tanstack/react-router'

// Groups moved into /fleet; old links and bookmarks still land somewhere.
export const Route = createFileRoute('/_dash/groups')({
	beforeLoad: () => {
		throw redirect({ to: '/fleet', replace: true })
	},
})
