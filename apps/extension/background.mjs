const CONSOLE = 'https://platform.claude.com'
const USAGEFLEET = 'https://usagefleet.com'
const SPEND_DAYS = 30

chrome.runtime.onInstalled.addListener(start)
chrome.runtime.onStartup.addListener(start)
chrome.alarms.onAlarm.addListener(sync)

// Chrome may drop alarms on restart, so every start schedules again and syncs once.
function start() {
	chrome.alarms.create('sync', { periodInMinutes: 60 })
	sync()
}

async function sync() {
	const org = await chrome.cookies.get({ name: 'lastActiveOrg', url: CONSOLE })
	if (!org) {
		console.warn('Not signed in to platform.claude.com, nothing to sync')
		return
	}
	const cost = await consoleCost(org.value)
	const res = await fetch(`${USAGEFLEET}/api/v1/console-spend`, {
		body: JSON.stringify(cost),
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	})
	if (!res.ok) {
		throw new Error(`UsageFleet answered ${res.status}, sign in at ${USAGEFLEET}`)
	}
}

/** The cost report the Console's own keys page reads, called with the Console sign-in cookie. */
async function consoleCost(orgUuid) {
	const since = new Date(Date.now() - SPEND_DAYS * 86_400_000)
	since.setUTCMinutes(0, 0, 0)
	const params = new URLSearchParams({
		'group_by[]': 'api_key_id',
		limit: '1000',
		starting_at: since.toISOString().replace('.000Z', 'Z'),
	})
	const data = []
	let refreshedAt = null
	for (;;) {
		const res = await fetch(`${CONSOLE}/v1/organizations/analytics/cost?${params}`, {
			credentials: 'include',
			headers: {
				'anthropic-beta': 'analytics-usage-cost-2026-08-24',
				'anthropic-version': '2026-10-21',
				'x-organization-uuid': orgUuid,
			},
		})
		if (!res.ok) {
			throw new Error(`Console answered ${res.status}`)
		}
		const page = await res.json()
		// Only the fields UsageFleet stores leave the browser; a raw row carries ~25 null groupings.
		for (const row of page.data) {
			data.push({
				cost: { amount: row.cost.amount, requests: row.cost.requests ?? null },
				group: { api_key_id: row.group.api_key_id ?? null, api_key_name: row.group.api_key_name ?? null },
			})
		}
		refreshedAt = page.data_refreshed_at ?? null
		if (!page.has_more || !page.next_page) {
			return { data, refreshedAt, since: since.toISOString() }
		}
		params.set('page', page.next_page)
	}
}
