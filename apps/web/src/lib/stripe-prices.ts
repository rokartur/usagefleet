import type Stripe from 'stripe'
import { requiredEnv, stripe } from '@/lib/auth'
import { PAID_PLANS, PLANS } from '@/lib/plans'
import type { PaidPlan, PlanPrices } from '@/lib/plans'

/** Stripe owns the amounts. Reading them back means a price edited in the Stripe
 *  dashboard can never leave the pricing page quoting the old number, and a
 *  self-hosted deployment quotes whatever its own `STRIPE_PRICE_*` ids cost
 *  rather than ours. Server only — route loaders hand the result to the UI.
 *
 *  ponytail: cached for the life of the process, so a price change needs a
 *  restart to show up. Add a TTL only if prices start moving more often than
 *  deploys do. */
const cached = new Map<string, Promise<PlanPrices>>()

/** `currency` is a request, not a promise: a locale gets its own currency only
 *  when every plan carries it in Stripe. */
export function planPrices(currency: string): Promise<PlanPrices> {
	const pending =
		cached.get(currency) ??
		// A failed fetch must not stick: drop the cache so the next request retries
		// instead of serving Stripe's bad minute for the life of the container.
		load(currency).catch(error => {
			cached.delete(currency)
			throw error
		})
	cached.set(currency, pending)
	return pending
}

/** A price's amount in one currency: its own, or one of the extra currencies
 *  configured on it. `null` means this price is not sold in that currency. */
function amountIn(price: Stripe.Price, currency: string): number | null {
	return price.currency === currency ? price.unit_amount : (price.currency_options?.[currency]?.unit_amount ?? null)
}

async function load(currency: string): Promise<PlanPrices> {
	const prices = await Promise.all(
		PAID_PLANS.map(async (id): Promise<[PaidPlan, Stripe.Price]> => {
			const env = PLANS[id].priceIdEnv
			const price = await stripe.prices.retrieve(requiredEnv(env), { expand: ['currency_options'] })
			// Tiered and usage-based prices have no single amount to render, and the
			// per-device maths elsewhere would silently produce NaN from one.
			if (price.unit_amount === null) {
				throw new Error(`${env} must be a fixed per-unit price`)
			}
			return [id, price]
		}),
	)

	const [first] = prices
	if (!first) {
		throw new Error('No paid plans configured')
	}
	// The base currency is what every plan is quoted in when the requested one is
	// missing, so the plans have to agree on it — and Stripe refuses a checkout
	// mixing currencies anyway, which would make a disagreement unsellable.
	const base = first[1].currency
	for (const [id, price] of prices) {
		if (price.currency !== base) {
			throw new Error(`${PLANS[id].priceIdEnv} is priced in ${price.currency}, expected ${base}`)
		}
	}

	// All or nothing: a pricing page quoting one tier in złoty and the next in
	// dollars is worse than quoting all three in dollars.
	const resolved = prices.every(([, price]) => amountIn(price, currency) !== null) ? currency : base

	return {
		// Keys come from PAID_PLANS, which is derived from the catalog, so the
		// record is exhaustive by construction — `fromEntries` just can't say so.
		amounts: Object.fromEntries(
			prices.map(([id, price]) => [id, amountIn(price, resolved)]),
		) as PlanPrices['amounts'],
		currency: resolved,
	}
}
