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

/** Monthly price in each plan's minor unit behind its `priceIdEnv`: the whole
 *  tier for the fixed plans, one device for `custom`. Fetched in
 *  lib/stripe-prices.ts and handed down through route loaders, so client
 *  components stay pure data. The currency travels with the amounts because a
 *  number without one is a price waiting to be rendered wrong. */
export interface PlanPrices {
	/** ISO 4217, lower-case, as Stripe reports it. */
	currency: string
	amounts: Record<PaidPlan, number>
}

export type PlanId = PaidPlan | 'free'

/** The catalog is the list, so a plan can never be sold without being defined.
 *  Declaration order is the order tiers are offered in. */
export const PAID_PLANS = Object.keys(PLANS) as PaidPlan[]

/** Devices an account gets without paying — enough to try it on one machine.
 *  An admin can raise it per account (user_settings.free_device_limit). */
export const FREE_DEVICES = 1

/** Reads the admin panel's free-allowance field. Blank or unparseable clears the
 *  grant back to FREE_DEVICES; anything else is clamped to a whole number in
 *  [0, the custom plan's ceiling] so a slipped keystroke can't hand out 8000
 *  devices. */
export const parseFreeDeviceLimit = (raw: string): number | null => {
	const devices = Math.trunc(Number(raw))
	return raw.trim() === '' || !Number.isFinite(devices)
		? null
		: Math.min(Math.max(devices, 0), PLANS.custom.maxDevices)
}

/** Narrows a plan name stored by Stripe to one we still sell. `Object.hasOwn`,
 *  not `in` — `in` walks the prototype chain, so "toString" would resolve to a
 *  plan with an undefined device cap, i.e. no cap at all. */
export const isPaidPlan = (name: string): name is PaidPlan => Object.hasOwn(PLANS, name)

export const planLabel = (plan: PlanId): string => (plan === 'free' ? 'Free' : PLANS[plan].label)

/** Devices a plan entitles, given the subscription's Stripe line-item quantity.
 *  Only `custom` varies with it, and there the entitlement is exactly what was
 *  billed — never rounded up to `minDevices`, which would hand out devices
 *  nobody paid for, and never capped at `maxDevices`, which would withhold
 *  devices someone did pay for. Both bounds are sales rules about what may be
 *  purchased, so they belong at the checkout boundary, not at this read. */
export const planDevices = (plan: PlanId, seats: number | null): number => {
	if (plan === 'free') {
		return FREE_DEVICES
	}
	if (plan === 'custom') {
		// Unknown quantity only happens between checkout and the subscription
		// webhook; the advertised minimum is the short-lived benefit of the doubt.
		return seats === null ? PLANS.custom.minDevices : Math.max(0, Math.trunc(seats))
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
		return planDevices(plan, seats) * prices.amounts.custom
	}
	return prices.amounts[plan]
}

/** Prices render as "$3" but "$4.40" — trailing cents only when there are any —
 *  and as "12 zł" / "12,99 zł" once the locale is Polish. Symbol, separator and
 *  placement all come from Intl rather than a template, because "zł$" is the
 *  kind of thing a hand-rolled formatter ships. */
export const formatPlanPrice = (cents: number, { currency }: PlanPrices, locale: string): string => {
	const fractionDigits = cents % 100 === 0 ? 0 : 2
	return new Intl.NumberFormat(locale, {
		currency,
		maximumFractionDigits: fractionDigits,
		minimumFractionDigits: fractionDigits,
		style: 'currency',
	}).format(cents / 100)
}
