import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { db } from '@/db'
import { devices, subscription } from '@/db/schema'
import { isPaidPlan, planDevices } from '@/lib/plans'
import type { PlanId } from '@/lib/plans'

/** Stripe keeps a subscription alive while it retries a failed charge
 *  (`past_due`) and cancels it on its own if dunning fails — don't yank a
 *  customer's devices on one declined card. */
const ENTITLING_STATUSES = ['active', 'trialing', 'past_due']

export interface AccountPlan {
	plan: PlanId
	/** Active (non-revoked) devices this account may hold. */
	deviceLimit: number
	/** Devices bought on the custom plan, i.e. the Stripe line-item quantity.
	 *  `null` on every fixed tier, whose cap comes from the catalog instead. */
	seats: number | null
	/** Stripe subscription status, or null when on the free plan. */
	status: string | null
	/** Subscription ends at `periodEnd` instead of renewing. */
	cancelAtPeriodEnd: boolean
	periodEnd: Date | null
}

/** The account's entitlement, read from the subscription table that the Stripe
 *  webhook keeps in sync. Anything unrecognised or lapsed falls back to free —
 *  this is the only place device caps come from. */
export async function accountPlan(userId: string): Promise<AccountPlan> {
	const [row] = await db
		.select()
		.from(subscription)
		.where(and(eq(subscription.referenceId, userId), inArray(subscription.status, ENTITLING_STATUSES)))
		.orderBy(desc(subscription.periodEnd))
		.limit(1)

	const plan: PlanId = row && isPaidPlan(row.plan) ? row.plan : 'free'
	const seats = plan === 'custom' ? (row?.seats ?? null) : null
	return {
		cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
		deviceLimit: planDevices(plan, seats),
		periodEnd: row?.periodEnd ?? null,
		plan,
		seats,
		status: row?.status ?? null,
	}
}

/** Whether a device still fits inside its account's plan. Creating a device is
 *  capped, but a downgrade or cancellation leaves an account holding more
 *  devices than it pays for — so the collector APIs re-check on every call.
 *  Slots go to the oldest active devices; the rest are parked, not revoked, so
 *  resubscribing brings them back without reinstalling a collector. */
export async function deviceWithinPlan(device: { userId: string; createdAt: Date }): Promise<boolean> {
	const [plan, older] = await Promise.all([
		accountPlan(device.userId),
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(devices)
			.where(
				and(
					eq(devices.userId, device.userId),
					eq(devices.revoked, false),
					lt(devices.createdAt, device.createdAt),
				),
			),
	])
	return (older[0]?.n ?? 0) < plan.deviceLimit
}

/** The 402 the collector sees once its device falls outside the plan. */
export const overPlanLimit = () =>
	Response.json({ code: 'plan_limit', error: "device is outside your plan's device limit" }, { status: 402 })
