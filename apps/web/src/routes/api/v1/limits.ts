import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { claudeAccounts, devices, groups } from '@/db/schema'
import { deviceWithinPlan, overPlanLimit } from '@/lib/billing'
import {
	dashboardForDevice,
	getLiveDashboards,
	recalibrateAccount,
	recordLimitChangePoint,
	recordLimitSample,
} from '@/lib/data'
import { authenticateDevice } from '@/lib/device-auth'
import { readJsonCapped } from '@/lib/rate-limit'
import { LIMITS_STALE_MS, reportedWindows, toDate } from '@/lib/usage/limits'

// Decimals allowed: collectors keep one decimal of Anthropic's utilization so
// the group split (which multiplies by group count) doesn't amplify rounding.
const PCT = '0 <= number <= 100 | null'

const LimitsSchema = type({
	source: "'sub' | 'api'",
	// Which Anthropic account the reading came from, read by the collector from
	// the local Claude Code login. Absent from pre-multi-account collectors and
	// from API-key setups, which land in the unidentified bucket instead.
	'account?': type({
		extId: '0 < string <= 100',
		'email?': 'string <= 200 | null',
		'org?': 'string <= 200 | null',
	}).or('null'),
	'fiveHourPct?': PCT,
	'sevenDayPct?': PCT,
	'fiveHourResetsAt?': 'string | null',
	'sevenDayResetsAt?': 'string | null',
	// Per-model limits from the dynamic rate-limit headers (e.g. Fable weekly).
	// Keys are constrained to header-safe charsets so junk can't land in jsonb.
	// Note arktype keeps undeclared keys rather than stripping them, so what
	// actually bounds this column is the explicit field-by-field map below —
	// storing a validated object wholesale would put attacker keys in jsonb.
	'modelLimits?': type({
		model: '/^[a-z0-9][a-z0-9_.-]{0,63}$/',
		window: '/^\\d{1,3}[hdwm]$/',
		'pct?': PCT,
		'resetsAt?': 'string | null',
	})
		.array()
		.atMostLength(16)
		.or('null'),
})

/**
 * The calling device's own group slice, for surfacing usage outside the
 * dashboard (status bars, editor plugins). Percentages are the group's budget
 * slice — the same numbers the dashboard's group table shows — because the
 * account-wide utilization a collector reads locally cannot be split per group
 * without every device's events.
 *
 * Also the enforcement read: `usagefleet guard` calls this on every prompt
 * and refuses the prompt when `blocked` is true.
 */
async function GET(req: Request) {
	const auth = await authenticateDevice(req, 'limits-read')
	if ('response' in auth) {
		return auth.response
	}
	const { device } = auth
	if (!(await deviceWithinPlan(device))) {
		return overPlanLimit(device.id)
	}

	// Owner-scoped so a stray cross-tenant groupId can never read another
	// account's switches.
	const [dashboards, group] = await Promise.all([
		getLiveDashboards(device.userId),
		device.groupId
			? db
					.select({
						blockOnSessionLimit: groups.blockOnSessionLimit,
						blockOnWeeklyLimit: groups.blockOnWeeklyLimit,
					})
					.from(groups)
					.where(and(eq(groups.id, device.groupId), eq(groups.ownerId, device.userId)))
					.limit(1)
					.then(r => r[0])
			: undefined,
	])
	// A device is measured against the subscription it is signed into.
	const dash = dashboardForDevice(dashboards, device.claudeAccountId)
	const usage = dash.groups.find(g => g.groupId === device.groupId)
	const sessionPct = usage?.sessionBudgetPct ?? 0
	const weeklyPct = usage?.weeklyBudgetPct ?? 0

	// Never block on a reading older than LIMITS_STALE_MS — see the constant for
	// why a frozen percentage would otherwise refuse prompts forever.
	const fresh = dash.reportedAt !== null && Date.now() - dash.reportedAt.getTime() <= LIMITS_STALE_MS

	// Per-group enforcement switches, gated by the device's own blocking toggle
	// — a machine switched off on the devices page is never refused, whatever
	// its group says. Both windows are measured against the group's equal budget
	// slice, so 100% means "ate my share", not "the account is out" — a group
	// only blocks itself, never its siblings.
	const blockedWindow =
		fresh && device.blockingEnabled
			? group?.blockOnSessionLimit && sessionPct >= 100
				? 'session'
				: group?.blockOnWeeklyLimit && weeklyPct >= 100
					? 'weekly'
					: null
			: null
	const resetsAt = blockedWindow === 'session' ? dash.fiveHourResetsAt : dash.sevenDayResetsAt

	return Response.json(
		{
			group: usage?.name ?? null,
			sessionPct,
			weeklyPct,
			blocked: blockedWindow !== null,
			blockedWindow,
			blockedUntil: blockedWindow ? (resetsAt?.toISOString() ?? null) : null,
			// Null until a collector reports real utilization; the percentages above
			// are meaningless (0) until then, and stale once this stops moving.
			reportedAt: dash.connected ? (dash.reportedAt?.toISOString() ?? null) : null,
		},
		{ headers: { 'cache-control': 'no-store' } },
	)
}

async function POST(req: Request) {
	const auth = await authenticateDevice(req, 'limits')
	if ('response' in auth) {
		return auth.response
	}
	const { device } = auth
	if (!(await deviceWithinPlan(device))) {
		return overPlanLimit(device.id)
	}

	const body = await readJsonCapped(req, 64 * 1024, LimitsSchema)
	if (!body.ok) {
		return body.response
	}
	const b = body.value
	const now = new Date()

	const set = {
		limitSource: b.source,
		limitsReportedAt: now,
		updatedAt: now,
		// Only the windows this report actually carried — see reportedWindows.
		...reportedWindows(b),
		// Only overwrite the stored per-model limits when the collector sent a
		// non-empty set. The per-model caps come from a flaky best-effort OAuth
		// endpoint that returns [] on any timeout/hiccup; an empty array must not
		// wipe the last-known-good limits (that's what made the section flicker).
		// An older collector that omits the field entirely is preserved the same way.
		// Reset strings are normalized to ISO (unparseable → null) before storing.
		...(b.modelLimits != null &&
			b.modelLimits.length > 0 && {
				modelLimits: b.modelLimits.map(m => ({
					model: m.model,
					window: m.window,
					pct: m.pct ?? null,
					resetsAt: toDate(m.resetsAt)?.toISOString() ?? null,
				})),
			}),
	}
	// Percentages are Anthropic's and Anthropic reports them per subscription, so
	// they are stored per account.
	const identity = b.account ?? null
	// A report that can't name its login stays on the account this device is
	// already bound to: `~/.claude.json` is briefly unreadable while Claude Code
	// rewrites it, and falling into the ext_id = NULL bucket on that one read
	// would pull the device out of its identified account — taking that account's
	// card off the dashboard with it, since a view needs a live device. API-key
	// devices and pre-multi-account collectors are bound to the bucket already,
	// which is exactly where their history lives, so they stay there.
	const boundExtId =
		identity === null && device.claudeAccountId !== null
			? await db
					.select({ extId: claudeAccounts.extId })
					.from(claudeAccounts)
					.where(and(eq(claudeAccounts.id, device.claudeAccountId), eq(claudeAccounts.userId, device.userId)))
					.limit(1)
					.then(r => r[0]?.extId ?? null)
			: null
	const [account] = await db
		.insert(claudeAccounts)
		.values({
			id: randomUUID(),
			userId: device.userId,
			extId: identity?.extId ?? boundExtId,
			email: identity?.email ?? null,
			orgName: identity?.org ?? null,
			...set,
		})
		.onConflictDoUpdate({
			target: [claudeAccounts.userId, claudeAccounts.extId],
			// Display names are only refreshed when the collector sent them, so a
			// report from an older client can't blank out a known label.
			set: {
				...set,
				...(identity?.email ? { email: identity.email } : {}),
				...(identity?.org ? { orgName: identity.org } : {}),
			},
		})
		.returning({
			calibration: claudeAccounts.calibration,
			extId: claudeAccounts.extId,
			id: claudeAccounts.id,
			userId: claudeAccounts.userId,
		})

	await Promise.all([
		// Keep a per-window record of the reported utilization: Claude only reports
		// the open window, so this is the past-windows card's only ground truth
		// once a window closes.
		recordLimitSample(account, '5h', b.fiveHourPct, set.fiveHourResetsAt ?? null),
		recordLimitSample(account, '7d', b.sevenDayPct, set.sevenDayResetsAt ?? null),
		// And a timestamped change point per window when the pct rose — the raw
		// material for delta attribution in the group split. The reset time scopes
		// the comparison to the current window; identified accounts only, enforced
		// inside.
		recordLimitChangePoint(account, '5h', b.fiveHourPct, now, set.fiveHourResetsAt ?? null),
		recordLimitChangePoint(account, '7d', b.sevenDayPct, now, set.sevenDayResetsAt ?? null),
		// Per-model caps get their own series, so a model row's split survives a
		// backlogged device: a late batch can only claim the rises of the intervals
		// it actually falls in, instead of re-deriving the whole window's cost share.
		// Driven off `set` so points are only appended for a report that was stored,
		// never for the empty array a hiccuping OAuth endpoint returns.
		...(set.modelLimits ?? []).map(m =>
			recordLimitChangePoint(account, m.window, m.pct, now, toDate(m.resetsAt), m.model),
		),
		// Touch the device so the Devices list shows an accurate last-seen time, and
		// bind it to the account whose usage it is now producing.
		db.update(devices).set({ claudeAccountId: account.id, lastSeenAt: now }).where(eq(devices.id, device.id)),
	])

	// Refit this account's limit weights if a day has passed — deliberately not
	// awaited, and self-throttled inside. The collector is posting on a timer with
	// nobody waiting on the answer, which makes this the cheapest periodic hook in
	// the app; a failed refit just leaves the previous weights in place.
	void recalibrateAccount(account, now).catch(error => console.error('recalibrate failed', error))

	return Response.json({ ok: true })
}

export const Route = createFileRoute('/api/v1/limits')({
	server: {
		handlers: {
			GET: ({ request }) => GET(request),
			POST: ({ request }) => POST(request),
		},
	},
})
