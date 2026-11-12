import { and, eq, gt, gte, inArray, isNull } from 'drizzle-orm'
import { createTranslator, hasLocale } from 'use-intl'
import { sendNotification } from 'web-push'
import { db } from '@/db'
import { claudeAccounts, limitSamples, pushSubscriptions } from '@/db/schema'
import type { LimitWindow } from '@/db/schema'
import { DEFAULT_LOCALE, LOCALES } from '@/lib/i18n'
import { MESSAGES } from '@/messages'

/** A window has to have reached this before its reset is worth a push: the 5h one
 *  resets several times a day, and "back to 0%" only matters near the wall. */
export const RESET_PUSH_MIN_PCT = 80

const HOUR_MS = 60 * 60 * 1000
const WINDOW_MS: Record<LimitWindow, number> = { '5h': 5 * HOUR_MS, '7d': 7 * 24 * HOUR_MS }
// limit_sample snaps windowStart to a 5 min grid, so the derived end can sit 2.5 min early.
const GRID_SLACK_MS = 150_000
// A window that ended longer ago than this is history, not news (deploys, restarts).
const STALE_MS = 30 * 60 * 1000

/** Hosts of the push services browsers actually use. The server POSTs to whatever endpoint
 *  a client registers, so without this list a subscription is an SSRF into our network. */
const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])

export function isPushEndpoint(endpoint: string): boolean {
	let url: URL
	try {
		url = new URL(endpoint)
	} catch {
		return false
	}
	if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') {
		return false
	}
	return PUSH_HOSTS.has(url.hostname) || url.hostname.endsWith('.notify.windows.com')
}

export function pushPublicKey(): string | null {
	return vapid()?.publicKey ?? null
}

function vapid() {
	const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env
	return publicKey && privateKey && subject ? { privateKey, publicKey, subject } : null
}

/** Whether a sample's window has just reset and earned a push: past its reset time,
 *  not yet stale, and it reached the threshold. */
export function resetDue(sample: { window: LimitWindow; windowStart: Date; peakPct: number }, now: Date): boolean {
	if (sample.peakPct < RESET_PUSH_MIN_PCT) {
		return false
	}
	const resetAt = sample.windowStart.getTime() + WINDOW_MS[sample.window] + GRID_SLACK_MS
	const since = now.getTime() - resetAt
	return since >= 0 && since < STALE_MS
}

/** One sweep: every window that just reset for a user with a subscription gets one push
 *  per browser. Called every minute by server/reset-push.ts. */
export async function sendDueResetPushes(now: Date): Promise<void> {
	const keys = vapid()
	if (!keys) {
		return
	}
	const subscribers = db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions)
	const candidates = await db
		.select({
			claudeAccountId: limitSamples.claudeAccountId,
			email: claudeAccounts.email,
			peakPct: limitSamples.peakPct,
			userId: limitSamples.userId,
			window: limitSamples.window,
			windowStart: limitSamples.windowStart,
		})
		.from(limitSamples)
		.innerJoin(claudeAccounts, eq(claudeAccounts.id, limitSamples.claudeAccountId))
		.where(
			and(
				isNull(limitSamples.resetNotifiedAt),
				gte(limitSamples.peakPct, RESET_PUSH_MIN_PCT),
				gt(limitSamples.windowStart, new Date(now.getTime() - WINDOW_MS['7d'] - HOUR_MS)),
				inArray(limitSamples.userId, subscribers),
			),
		)

	for (const sample of candidates) {
		if (!resetDue(sample, now)) {
			continue
		}
		// Claimed before sending, so an overlapping sweep cannot push the same reset twice.
		const claimed = await db
			.update(limitSamples)
			.set({ resetNotifiedAt: now })
			.where(
				and(
					eq(limitSamples.claudeAccountId, sample.claudeAccountId),
					eq(limitSamples.window, sample.window),
					eq(limitSamples.windowStart, sample.windowStart),
					isNull(limitSamples.resetNotifiedAt),
				),
			)
			.returning({ window: limitSamples.window })
		if (claimed.length === 0) {
			continue
		}
		const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, sample.userId))
		for (const sub of subs) {
			await sendResetPush(sub, sample, keys)
		}
	}
}

async function sendResetPush(
	sub: typeof pushSubscriptions.$inferSelect,
	sample: { window: LimitWindow; email: string | null },
	keys: { publicKey: string; privateKey: string; subject: string },
): Promise<void> {
	const locale = hasLocale(LOCALES, sub.locale) ? sub.locale : DEFAULT_LOCALE
	const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'dash.resetPush' })
	const payload = JSON.stringify({
		body: sample.email ? t('bodyAccount', { account: sample.email }) : t('body'),
		title: sample.window === '5h' ? t('fiveHour') : t('weekly'),
	})
	try {
		await sendNotification({ endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, payload, {
			TTL: STALE_MS / 1000,
			vapidDetails: keys,
		})
	} catch (error) {
		// 404/410: the browser dropped the subscription (unsubscribed, cleared site data).
		const status = (error as { statusCode?: number }).statusCode
		if (status === 404 || status === 410) {
			await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
			return
		}
		console.error('reset push failed', status, error)
	}
}
