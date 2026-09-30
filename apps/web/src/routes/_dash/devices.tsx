import { createFileRoute, redirect } from '@tanstack/react-router'

// Devices moved into /fleet. Collectors older than this change still print this
// URL in their "outside your plan" message, so it must keep working.
export const Route = createFileRoute('/_dash/devices')({
	beforeLoad: () => {
		throw redirect({ to: '/fleet', replace: true })
	},
})
