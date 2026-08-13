/** The plan catalog — pure data, safe to import from client components.
 *  Server-side entitlement lookup lives in lib/billing.ts. */

export const PAID_PLANS = ["solo", "fleet"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type PlanId = PaidPlan | "free";

/** Devices are the only thing a subscription buys today. Price ids are env
 *  names, not values, so one build serves both Stripe test and live mode. */
export const PLANS: Record<
  PaidPlan,
  { label: string; devices: number; priceUsd: number; priceIdEnv: string }
> = {
  solo: { label: "Solo", devices: 2, priceUsd: 1, priceIdEnv: "STRIPE_PRICE_SOLO" },
  fleet: { label: "Fleet", devices: 8, priceUsd: 3, priceIdEnv: "STRIPE_PRICE_FLEET" },
};

/** Devices an account gets without paying — enough to try it on one machine. */
export const FREE_DEVICES = 1;

/** Narrows a plan name stored by Stripe to one we still sell. `Object.hasOwn`,
 *  not `in` — `in` walks the prototype chain, so "toString" would resolve to a
 *  plan with an undefined device cap, i.e. no cap at all. */
export const isPaidPlan = (name: string): name is PaidPlan => Object.hasOwn(PLANS, name);

export const planLabel = (plan: PlanId): string => (plan === "free" ? "Free" : PLANS[plan].label);
