import { type } from 'arktype'
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { createPromiseCache } from '@/lib/promise-cache'

const BASE = 'https://api.anthropic.com/v1/organizations'
const SPEND_DAYS = 30

export const ADMIN_KEY_PREFIX = 'sk-ant-admin'

// Also the shape the Console extension posts, so every free-form string is capped.
export const costRow = type({
	cost: { amount: /^\d{1,15}(\.\d{1,12})?$/, 'requests?': 'number | null' },
	group: { 'api_key_id?': 'string <= 100 | null', 'api_key_name?': 'string <= 500 | null' },
})

const costPage = type({
	data: costRow.array(),
	has_more: 'boolean',
	'next_page?': 'string | null',
	'data_refreshed_at?': 'string | null',
})

const keysPage = type({
	data: type({ id: 'string', name: 'string', 'partial_key_hint?': 'string | null', status: 'string' }).array(),
	has_more: 'boolean',
	'last_id?': 'string | null',
})

type CostRow = typeof costRow.infer
type ApiKey = (typeof keysPage.infer)['data'][number]

function secret() {
	const value = process.env.BETTER_AUTH_SECRET
	if (!value) {
		throw new Error('BETTER_AUTH_SECRET is not set')
	}
	return value
}

export function sealAdminKey(adminKey: string) {
	return symmetricEncrypt({ key: secret(), data: adminKey })
}

async function get(adminKey: string, path: string, params: URLSearchParams) {
	const res = await fetch(`${BASE}/${path}?${params}`, {
		headers: {
			'anthropic-beta': 'analytics-usage-cost-2026-08-24',
			'anthropic-version': '2026-10-21',
			'x-api-key': adminKey,
		},
		signal: AbortSignal.timeout(15_000),
	})
	if (!res.ok) {
		throw new Error(`Anthropic answered ${res.status} on ${path}`)
	}
	return res.json()
}

/** Every row of the analytics cost report for the last 30 days, one per API key. */
async function costByKey(adminKey: string) {
	const since = new Date(Date.now() - SPEND_DAYS * 86_400_000)
	since.setUTCMinutes(0, 0, 0)
	const params = new URLSearchParams({
		'group_by[]': 'api_key_id',
		limit: '1000',
		starting_at: since.toISOString().replace('.000Z', 'Z'),
	})
	const rows: CostRow[] = []
	let refreshedAt: string | null = null
	for (;;) {
		const page = costPage.assert(await get(adminKey, 'analytics/cost', params))
		rows.push(...page.data)
		refreshedAt = page.data_refreshed_at ?? null
		if (!page.has_more || !page.next_page) {
			return { refreshedAt, rows, since: since.toISOString() }
		}
		params.set('page', page.next_page)
	}
}

async function listKeys(adminKey: string) {
	const params = new URLSearchParams({ limit: '1000' })
	const keys: ApiKey[] = []
	for (;;) {
		const page = keysPage.assert(await get(adminKey, 'api_keys', params))
		keys.push(...page.data)
		if (!page.has_more || !page.last_id) {
			return keys
		}
		params.set('after_id', page.last_id)
	}
}

/** Joins cost rows to key names. Amounts arrive as cent strings; a null key id is
 *  usage made without a key (Console workbench, keyless Claude Code sign-in). */
export function spendRows(rows: CostRow[], keys: ApiKey[]) {
	const byId = new Map(keys.map(k => [k.id, k]))
	return rows
		.map(row => {
			const id = row.group.api_key_id ?? null
			const key = id ? byId.get(id) : undefined
			return {
				hint: key?.partial_key_hint ?? null,
				id,
				name: key?.name ?? row.group.api_key_name ?? null,
				requests: row.cost.requests ?? null,
				status: key?.status ?? null,
				usd: Number(row.cost.amount) / 100,
			}
		})
		.toSorted((a, b) => b.usd - a.usd)
}

export function toSpend(cost: { refreshedAt: string | null; rows: CostRow[]; since: string }, keys: ApiKey[]) {
	const rows = spendRows(cost.rows, keys)
	return {
		refreshedAt: cost.refreshedAt,
		rows,
		since: cost.since,
		totalUsd: rows.reduce((sum, row) => sum + row.usd, 0),
	}
}

export type ApiKeySpend = ReturnType<typeof toSpend>

async function loadSpend(ciphertext: string) {
	const adminKey = await symmetricDecrypt({ key: secret(), data: ciphertext })
	const [cost, keys] = await Promise.all([costByKey(adminKey), listKeys(adminKey)])
	return toSpend(cost, keys)
}

/** Keyed by ciphertext, which is fresh per save, so a replaced key never reads the old one's cache.
 *  Anthropic refreshes this data every ~4 hours, 5 minutes only absorbs reloads. */
export const apiKeySpend = createPromiseCache(5 * 60_000, loadSpend)

/** Fetches once with a key that is not stored yet, so a wrong key is refused at save time. */
export async function checkAdminKey(adminKey: string) {
	await Promise.all([costByKey(adminKey), listKeys(adminKey)])
}
