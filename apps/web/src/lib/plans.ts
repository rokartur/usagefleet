/** The plan catalog — pure data, safe to import from client components.
 *  Server-side entitlement lookup lives in lib/billing.ts. */

/** Devices are the only thing a subscription buys today. Amounts are not here:
 *  Stripe holds them and lib/stripe-prices.ts reads them, so the catalog can
 *  never quote a price the customer isn't actually charged. Price ids are env
 *  names, not values, so one build serves both Stripe test and live mode.
 *
 *  The fixed tiers sell a set device count. `custom` instead names a per-unit
 *  Stripe price and lets the buyer choose the count: Stripe charges unit price ×
 *  line-item quantity, and better-auth mirrors that quantity into
 *  `subscription.seats`. So `custom` deliberately has no `devices` of its own,
 *  which makes the compiler send every reader through `planDevices` instead of
 *  reaching for a field that only the fixed tiers have. */
export const PLANS = {
	custom: {
		label: 'Custom',
		/** Not a technical limit — just the point past which we'd rather talk than
		 *  let a typo in a number field bill someone thousands. */
		maxDevices: 200,
		minDevices: 10,
		priceIdEnv: 'STRIPE_PRICE_CUSTOM',
	},
	fleet: {
		devices: 8,
		label: 'Fleet',
		priceIdEnv: 'STRIPE_PRICE_FLEET',
	},
	solo: {
		devices: 2,
		label: 'Solo',
		priceIdEnv: 'STRIPE_PRICE_SOLO',
	},
} as const

export type PaidPlan = keyof typeof PLANS

/** Monthly price in cents behind each plan's `priceIdEnv`: the whole tier for
 *  the fixed plans, one device for `custom`. Fetched in lib/stripe-prices.ts and
 *  handed down through route loaders, so client components stay pure data. */
export type PlanPrices = Record<PaidPlan, number>

export type PlanId = PaidPlan | 'free'

/** The catalog is the list, so a plan can never be sold without being defined.
 *  Declaration order is the order tiers are offered in. */
export const PAID_PLANS = Object.keys(PLANS) as PaidPlan[]

/** Devices an account gets without paying — enough to try it on one machine. */
export const FREE_DEVICES = 1

/** Narrows a plan name stored by Stripe to one we still sell. `Object.hasOwn`,
 *  not `in` — `in` walks the prototype chain, so "toString" would resolve to a
 *  plan with an undefined device cap, i.e. no cap at all. */
export const isPaidPlan = (name: string): name is PaidPlan => Object.hasOwn(PLANS, name)

export const planLabel = (plan: PlanId): string => (plan === 'free' ? 'Free' : PLANS[plan].label)

/** Devices a plan entitles, given the subscription's Stripe line-item quantity.
 *  Only `custom` varies with it, and there the quantity is exactly what the
 *  customer is billed for — so it, not our advertised minimum, is the cap. The
 *  minimum is a sales floor enforced where people pick a number; buying under it
 *  would only ever buy fewer devices, never cheaper ones. */
export const planDevices = (plan: PlanId, seats: number | null): number => {
	if (plan === 'free') {
		return FREE_DEVICES
	}
	if (plan === 'custom') {
		return seats ?? PLANS.custom.minDevices
	}
	return PLANS[plan].devices
}

/** What Stripe will charge this subscription per month, in cents — the tier
 *  price as-is, or the per-device price times the devices bought. Cents, because
 *  `15 * 0.4` is not 6 in binary floating point. */
export const planPriceCents = (plan: PlanId, seats: number | null, prices: PlanPrices): number => {
	if (plan === 'free') {
		return 0
	}
	if (plan === 'custom') {
		return planDevices(plan, seats) * prices.custom
	}
	return prices[plan]
}

/** Prices render as "$3" but "$4.40" — trailing cents only when there are any. */
export const formatPlanPrice = (cents: number): string =>
	cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
