import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { type } from 'arktype'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { devices, groups, userSettings } from '@/db/schema'
import { accountPlan } from '@/lib/billing'
import { ensureDefaultGroup, ensureSettings } from '@/lib/data'
import { generateDeviceToken } from '@/lib/device-token'
import { requireUser } from '@/lib/session'

/** Accept only a #rrggbb hex color; fall back to the default otherwise so a
 *  malformed value can't render a broken swatch or pollute stored data. */
function safeColor(v: string): string {
	return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#6366f1'
}

/** Longest device or group name we store. Both columns are `text`, so nothing
 *  underneath bounds them, and every name is echoed into each dashboard poll —
 *  one oversized name would be re-sent to every tab every 5 seconds. */
const MAX_NAME = 64

/** A trimmed, length-capped name, or null when there is no usable one. Takes
 *  `unknown` because all of these arrive from the client: `createDevice` is
 *  handed parsed JSON, and `FormData.get` returns a `File` just as readily as a
 *  string. */
function safeName(value: unknown): string | null {
	const trimmed = typeof value === 'string' ? value.trim() : ''
	return trimmed ? trimmed.slice(0, MAX_NAME) : null
}

/** Payload for {@link createDevice} — the one server fn here taking JSON rather
 *  than FormData. Without a real check its handler trusted the shape outright,
 *  so a posted `name: 123` reached `.trim()` and answered 500.
 *
 *  Both ceilings are rejection limits, not storage limits, and they sit far above
 *  any real name so only abuse meets them. They bound what reaches the database
 *  and `ownedGroupId`, not what the server reads off the wire — this runs after
 *  the body has been received and parsed. Capping the transport would take a
 *  `readJsonCapped` equivalent, which `createServerFn` has no hook for. */
const deviceInput = type({ groupId: 'string <= 64 | null', name: 'string <= 256' })

/** Count the user's groups (for the per-account cap). */
async function groupCount(userId: string): Promise<number> {
	const rows = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(groups)
		.where(eq(groups.ownerId, userId))
	return rows[0]?.n ?? 0
}

/** Set the cache-write TTL used for pricing ('5m' | '1h'). */
export const updateCacheTtl = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const user = await requireUser()
		const ttl = formData.get('cacheWriteTtl') === '1h' ? '1h' : '5m'
		await ensureSettings(user.id)
		await db.update(userSettings).set({ cacheWriteTtl: ttl }).where(eq(userSettings.userId, user.id))
	})

export const createGroup = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const user = await requireUser()
		const name = safeName(formData.get('name'))
		const color = safeColor(String(formData.get('color') ?? '#6366f1'))
		if (!name) {
			return
		}
		// One group per device slot the plan pays for. Silently ignore over-cap
		// creates; the UI also disables the form.
		const { deviceLimit } = await accountPlan(user.id)
		if ((await groupCount(user.id)) >= deviceLimit) {
			return
		}
		await db.insert(groups).values({
			blockOnSessionLimit: formData.has('blockOnSessionLimit'),
			blockOnWeeklyLimit: formData.has('blockOnWeeklyLimit'),
			color,
			id: randomUUID(),
			name,
			ownerId: user.id,
		})
	})

/** Edit a group's color, name and its two blocking switches. */
export const updateGroup = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const user = await requireUser()
		const id = String(formData.get('id'))
		const color = safeColor(String(formData.get('color') ?? '#6366f1'))
		// Unchecked boxes aren't submitted, so absence is the "off" signal — the
		// dialog always posts both fields.
		const set: { blockOnSessionLimit: boolean; blockOnWeeklyLimit: boolean; color: string; name?: string } = {
			blockOnSessionLimit: formData.has('blockOnSessionLimit'),
			blockOnWeeklyLimit: formData.has('blockOnWeeklyLimit'),
			color,
		}
		// An absent field and a blank one mean the same thing here: leave the stored
		// name alone.
		const name = safeName(formData.get('name'))
		if (name) {
			set.name = name
		}
		await db
			.update(groups)
			.set(set)
			.where(and(eq(groups.id, id), eq(groups.ownerId, user.id)))
	})

export const deleteGroup = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const user = await requireUser()
		const id = String(formData.get('id'))
		// Reassign this group's devices before deleting so none are left ungrouped.
		const other = await db
			.select({ id: groups.id })
			.from(groups)
			.where(and(eq(groups.ownerId, user.id), ne(groups.id, id)))
			.orderBy(asc(groups.createdAt))
			.limit(1)
		const hasDevices = (
			await db
				.select({ id: devices.id })
				.from(devices)
				.where(and(eq(devices.userId, user.id), eq(devices.groupId, id)))
				.limit(1)
		)[0]
		if (hasDevices) {
			// Target an existing other group, or mint a fresh Default if this was the last.
			let targetId = other[0]?.id
			if (!targetId) {
				const made = await db
					.insert(groups)
					.values({
						color: '#6366f1',
						id: randomUUID(),
						name: 'Default',
						ownerId: user.id,
					})
					.returning()
				targetId = made[0].id
			}
			await db
				.update(devices)
				.set({ groupId: targetId })
				.where(and(eq(devices.userId, user.id), eq(devices.groupId, id)))
		}
		await db.delete(groups).where(and(eq(groups.id, id), eq(groups.ownerId, user.id)))
	})

/** Returns groupId only if it belongs to the user; null otherwise. Prevents
 *  attaching a device to another tenant's group (IDOR). */
async function ownedGroupId(userId: string, groupId: string | null): Promise<string | null> {
	if (!groupId) {
		return null
	}
	const owned = await db
		.select({ id: groups.id })
		.from(groups)
		.where(and(eq(groups.id, groupId), eq(groups.ownerId, userId)))
		.limit(1)
	return owned[0] ? groupId : null
}

export const assignDeviceGroup = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const user = await requireUser()
		const deviceId = String(formData.get('deviceId'))
		const raw = String(formData.get('groupId') ?? '')
		// Every device must belong to a group — fall back to the default rather than null.
		const owned = await ownedGroupId(user.id, raw === '' ? null : raw)
		const groupId = owned ?? (await ensureDefaultGroup(user.id)).id
		await db
			.update(devices)
			.set({ groupId })
			.where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)))
	})

/** Per-device kill switch for `usagefleet guard`: off = that machine is never
 *  refused a prompt, even when its group's blocking switches are on. */
export const setDeviceBlocking = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const user = await requireUser()
		const deviceId = String(formData.get('deviceId'))
		// Unchecked switches aren't submitted, so absence means "off".
		await db
			.update(devices)
			.set({ blockingEnabled: formData.get('enabled') === 'on' })
			.where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)))
	})

/** Creates a device + its API token. Returns the plaintext token ONCE. */
export const createDevice = createServerFn({ method: 'POST' })
	.inputValidator((data: unknown) => {
		const parsed = deviceInput(data)
		if (parsed instanceof type.errors) {
			throw new TypeError(parsed.summary)
		}
		return parsed
	})
	.handler(async ({ data: { name, groupId } }): Promise<{ id: string; token: string }> => {
		const user = await requireUser()
		// Revoked devices don't hold a slot — otherwise you'd have to hard-delete
		// audit history to add a machine. The UI also disables the form at the cap.
		const [{ n: active } = { n: 0 }] = await db
			.select({ n: sql<number>`count(*)::int` })
			.from(devices)
			.where(and(eq(devices.userId, user.id), eq(devices.revoked, false)))
		const { deviceLimit: maxDevices } = await accountPlan(user.id)
		if (active >= maxDevices) {
			throw new Error(`Device limit reached (${maxDevices}). Upgrade your plan on Billing.`)
		}
		// Devices are always grouped — fall back to the default when none is chosen.
		const safeGroupId = (await ownedGroupId(user.id, groupId || null)) ?? (await ensureDefaultGroup(user.id)).id
		const { token, tokenHash, tokenPrefix } = generateDeviceToken()
		const id = randomUUID()
		await db.insert(devices).values({
			groupId: safeGroupId,
			id,
			name: safeName(name) ?? 'New device',
			tokenHash,
			tokenPrefix,
			userId: user.id,
		})
		return { id, token }
	})

/** One-way: a device is either active or revoked, never removed.
 *
 *  Deleting it would take the usage history it reported with it, and a token
 *  that once existed should stay auditable. Revoked rows don't hold a plan
 *  slot, so keeping them costs the user nothing. */
export const revokeDevice = createServerFn({ method: 'POST' })
	.inputValidator((formData: FormData) => formData)
	.handler(async ({ data: formData }) => {
		const user = await requireUser()
		const id = String(formData.get('id'))
		await db
			.update(devices)
			.set({ revoked: true })
			.where(and(eq(devices.id, id), eq(devices.userId, user.id)))
	})
