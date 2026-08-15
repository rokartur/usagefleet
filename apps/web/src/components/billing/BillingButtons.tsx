import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { authClient } from '@/lib/auth-client'
import type { PaidPlan } from '@/lib/plans'

const BILLING_URL = '/billing'

/** Both calls answer with a Stripe URL and the better-auth client redirects the
 *  browser there, so a success path never has to render. */
function useStripeRedirect() {
	const [pending, startTransition] = useTransition()
	const go = (label: string, call: () => Promise<{ error?: { message?: string } | null }>) =>
		startTransition(async () => {
			const { error } = await call()
			if (error) {
				toast.add({
					priority: 'high',
					title: error.message ?? `Couldn't open ${label}. Please try again.`,
					type: 'error',
				})
			}
		})
	return [pending, go] as const
}

/** Starts Stripe checkout, or switches an existing subscription to `plan`.
 *  The two paths return different URLs: checkout uses success/cancelUrl, while
 *  a plan switch sends the subscriber to Stripe's update-confirm page and comes
 *  back to `returnUrl` — which defaults to "/", so it has to be given here. */
export function SubscribeButton({
	plan,
	label,
	seats,
	disabled,
	...buttonProps
}: {
	plan: PaidPlan
	label: string
	/** Devices to buy on the custom plan. Becomes the Stripe line-item quantity,
	 *  so it is both what we charge for and what the device cap reads back. */
	seats?: number
} & Omit<React.ComponentProps<typeof Button>, 'onClick' | 'children'>) {
	const [pending, go] = useStripeRedirect()
	return (
		<Button
			{...buttonProps}
			disabled={pending || disabled}
			onClick={() =>
				go('checkout', () =>
					authClient.subscription.upgrade({
						cancelUrl: BILLING_URL,
						plan,
						returnUrl: BILLING_URL,
						seats,
						successUrl: BILLING_URL,
					}),
				)
			}
		>
			{label}
		</Button>
	)
}

/** Stripe's own portal — payment method, invoices, and cancellation. */
export function BillingPortalButton() {
	const [pending, go] = useStripeRedirect()
	return (
		<Button
			variant='outline'
			disabled={pending}
			onClick={() =>
				go('the billing portal', () => authClient.subscription.billingPortal({ returnUrl: BILLING_URL }))
			}
		>
			Manage billing
		</Button>
	)
}
