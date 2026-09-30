import { createFileRoute, redirect } from '@tanstack/react-router'

// Billing moved into /account. Stripe checkouts already in flight return here,
// and ?plan= from a pricing CTA has to survive the hop.
export const Route = createFileRoute('/_dash/billing')({
	beforeLoad: ({ search }) => {
		throw redirect({ to: '/account', search, replace: true })
	},
})
