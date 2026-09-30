import { createFileRoute, redirect } from '@tanstack/react-router'

// Settings moved into /account. OAuth link attempts started before the move
// return here with ?error=, which /account reads.
export const Route = createFileRoute('/_dash/settings')({
	beforeLoad: ({ search }) => {
		throw redirect({ to: '/account', search, replace: true })
	},
})
