import { requiredEnv, stripe } from '@/lib/auth'
import { PAID_PLANS, PLANS } from '@/lib/plans'
import type { PlanPrices } from '@/lib/plans'

/** Stripe owns the amounts. Reading them back means a price edited in the Stripe
 *  dashboard can never leave the pricing page quoting the old number, and a
 *  self-hosted deployment quotes whatever its own `STRIPE_PRICE_*` ids cost
 *  rather than ours. Server only — route loaders hand the result to the UI.
 *
 *  ponytail: cached for the life of the process, so a price change needs a
 *  restart to show up. Add a TTL only if prices start moving more often than
 *  deploys do. */
let cached: Promise<PlanPrices> | undefined

export function planPrices(): Promise<PlanPrices> {
	// A failed fetch must not stick: drop the cache so the next request retries
	// instead of serving Stripe's bad minute for the life of the container.
	cached ??= load().catch(error => {
		cached = undefined
		throw error
	})
	return cached
}

async function load(): Promise<PlanPrices> {
	const entries = await Promise.all(
		PAID_PLANS.map(async id => {
			const env = PLANS[id].priceIdEnv
			const price = await stripe.prices.retrieve(requiredEnv(env))
			// Tiered and usage-based prices have no single amount to render, and the
			// per-device maths below would silently produce NaN from one.
			if (price.unit_amount === null) {
				throw new Error(`${env} must be a fixed per-unit price`)
			}
			return [id, price.unit_amount] as const
		}),
	)
	// Keys come from PAID_PLANS, which is derived from the catalog, so the record
	// is exhaustive by construction — `fromEntries` just can't say so.
	return Object.fromEntries(entries) as PlanPrices
}
