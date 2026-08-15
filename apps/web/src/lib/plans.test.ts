import { describe, expect, it } from 'vitest'
import {
	formatPlanPrice,
	FREE_DEVICES,
	isPaidPlan,
	PAID_PLANS,
	PLANS,
	parseFreeDeviceLimit,
	planDevices,
	planPriceCents,
} from './plans'
import type { PlanPrices } from './plans'

/** Stands in for what lib/stripe-prices.ts reads back from Stripe. */
const PRICES: PlanPrices = { custom: 35, fleet: 300, solo: 100 }

describe('plan catalog', () => {
	it('sells the advertised device caps', () => {
		expect(FREE_DEVICES).toBe(1)
		expect(PLANS.solo.devices).toBe(2)
		expect(PLANS.fleet.devices).toBe(8)
	})

	it('treats unknown or retired plan names as free', () => {
		// A stored subscription can name a plan we no longer sell — it must never
		// resolve to a paid cap by accident.
		expect(isPaidPlan('enterprise')).toBeFalsy()
		expect(isPaidPlan('toString')).toBeFalsy()
		for (const id of PAID_PLANS) {
			expect(isPaidPlan(id)).toBeTruthy()
		}
	})

	it('entitles custom plans to exactly the quantity billed, never more', () => {
		expect(planDevices('custom', 25)).toBe(25)
		// Rounding a small quantity up to the advertised minimum would hand out
		// nine devices nobody paid for, which is worse than the undercut the
		// minimum exists to prevent. The floor belongs at checkout instead.
		expect(planDevices('custom', 3)).toBe(3)
		expect(planDevices('custom', 0)).toBe(0)
		// Equally, a quantity above the advertised ceiling was still paid for.
		expect(planDevices('custom', 999_999)).toBe(999_999)
		// Only reachable before the subscription webhook lands.
		expect(planDevices('custom', null)).toBe(PLANS.custom.minDevices)
		// Fixed tiers have no quantity to read, whatever the column happens to say.
		expect(planDevices('fleet', 25)).toBe(PLANS.fleet.devices)
		expect(planDevices('free', 25)).toBe(FREE_DEVICES)
	})

	it('prices custom plans per device without floating point drift', () => {
		expect(planPriceCents('custom', 10, PRICES)).toBe(350)
		expect(planPriceCents('custom', 20, PRICES)).toBe(700) // 20 * 0.35 is 7.000000000000001
		expect(planPriceCents('custom', 11, PRICES)).toBe(385)
		expect(planPriceCents('solo', null, PRICES)).toBe(100)
		expect(planPriceCents('free', null, PRICES)).toBe(0)
	})

	it('reads an admin free-device grant, or clears it', () => {
		expect(parseFreeDeviceLimit('5')).toBe(5)
		expect(parseFreeDeviceLimit('0')).toBe(0)
		// Blank is "no grant", not zero devices — Number('') is 0, so the order of
		// these checks is the whole test.
		expect(parseFreeDeviceLimit('')).toBeNull()
		expect(parseFreeDeviceLimit('  ')).toBeNull()
		expect(parseFreeDeviceLimit('lots')).toBeNull()
		expect(parseFreeDeviceLimit('-3')).toBe(0)
		expect(parseFreeDeviceLimit('2.9')).toBe(2)
		expect(parseFreeDeviceLimit('99999')).toBe(PLANS.custom.maxDevices)
	})

	it('shows cents only when the price has any', () => {
		expect(formatPlanPrice(600)).toBe('$6')
		expect(formatPlanPrice(385)).toBe('$3.85')
		expect(formatPlanPrice(35)).toBe('$0.35')
	})
})
