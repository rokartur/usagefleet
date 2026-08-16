import type { ClaudeAccount } from './claude-account.js'
import type { ClaudeCreds } from './claude-creds.js'

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

/** One per-model limit (e.g. the Fable/Opus weekly cap) read from headers like
 *  `anthropic-ratelimit-unified-7d-fable-utilization`. */
export interface ModelLimit {
	/** Model family key from the header name, e.g. "fable" or "opus". */
	model: string
	/** Window key from the header name, e.g. "5h" or "7d". */
	window: string
	pct: number | null
	resetsAt: string | null
}

export interface LimitsReport {
	source: 'sub' | 'api'
	/** Which Anthropic account these percentages belong to. Only set for
	 *  subscription logins (an API key has no local account identity) and absent
	 *  on machines that never signed into Claude Code. */
	account?: ClaudeAccount | null
	fiveHourPct: number | null
	sevenDayPct: number | null
	fiveHourResetsAt: string | null
	sevenDayResetsAt: string | null
	/** Per-model limits, in header order. Empty when the account has none. */
	modelLimits: ModelLimit[]
}

export function parsePct(v: string | null): number | null {
	if (v == null || v === '') {
		return null
	}
	return clampPct(Number(v))
}

export function parseReset(v: string | null): string | null {
	if (!v) {
		return null
	}
	const num = Number(v)
	if (Number.isFinite(num) && num > 1_000_000_000) {
		// unix seconds (or ms)
		const ms = num > 1e12 ? num : num * 1000
		return new Date(ms).toISOString()
	}
	const d = new Date(v)
	return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Per-model utilization header: `anthropic-ratelimit-unified-<window>-<model>-utilization`
 *  (the account-wide headers have no `<model>` segment and don't match). */
const MODEL_UTIL_RE = /^anthropic-ratelimit-unified-(\d+[hdwm])-([a-z0-9][a-z0-9_.-]*)-utilization$/

export function parseLimitsHeaders(
	source: 'sub' | 'api',
	get: (name: string) => string | null,
	names: Iterable<string> = [],
): LimitsReport {
	const modelLimits: ModelLimit[] = []
	for (const raw of names) {
		const m = raw.toLowerCase().match(MODEL_UTIL_RE)
		if (!m) {
			continue
		}
		const [, window, model] = m
		modelLimits.push({
			model,
			pct: parsePct(get(raw)),
			resetsAt: parseReset(get(`anthropic-ratelimit-unified-${window}-${model}-reset`)),
			window,
		})
	}
	return {
		fiveHourPct: parsePct(get('anthropic-ratelimit-unified-5h-utilization')),
		fiveHourResetsAt: parseReset(get('anthropic-ratelimit-unified-5h-reset')),
		modelLimits,
		sevenDayPct: parsePct(get('anthropic-ratelimit-unified-7d-utilization')),
		sevenDayResetsAt: parseReset(get('anthropic-ratelimit-unified-7d-reset')),
		source,
	}
}

const OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

/**
 * Per-model limits for subscription logins. The Messages ping only returns the
 * account-wide 5h/7d headers; the per-model caps Claude's own UI shows (e.g.
 * "Fable · 24% used") come from the OAuth usage endpoint Claude Code queries
 * for /usage. Undocumented — parse defensively and return [] on any surprise.
 */
async function fetchOauthModelLimits(token: string): Promise<ModelLimit[]> {
	const res = await fetch(OAUTH_USAGE_URL, {
		headers: {
			'anthropic-beta': 'oauth-2025-04-20',
			authorization: `Bearer ${token}`,
			'user-agent': 'claude-code/2.1.5 (usagefleet)',
		},
		signal: AbortSignal.timeout(15_000),
	})
	if (!res.ok) {
		return []
	}
	const body: unknown = await res.json().catch(() => null)
	if (process.env.USAGEFLEET_DEBUG_HEADERS) {
		console.error(`[debug] oauth/usage: ${JSON.stringify(body)}`)
	}
	return parseOauthUsage(body)
}

/** Both sources report 0–100 percentages: the `-utilization` headers ("37") and
 *  oauth/usage's `utilization`/`percent` fields. Clamping is all they need — a
 *  0–1 "fraction form" heuristic would read a real 1% as 100%, which reaches the
 *  headline number, the critical notification and guard's prompt block.
 *
 *  Non-finite in, null out: `Infinity` (a JSON `1e999`, or a junk header) would
 *  otherwise clamp to a perfectly plausible 100 and block every prompt. */
function clampPct(n: number): number | null {
	if (!Number.isFinite(n)) {
		return null
	}
	return Math.min(100, Math.max(0, Math.round(n)))
}

/** Normalize a scope's model name to a header-safe key ("Fable" → "fable"). */
function modelKeyOf(name: string): string {
	return name.toLowerCase().replaceAll(/[^a-z0-9_.-]+/g, '-')
}

/**
 * Extract per-model entries from an oauth/usage payload.
 *
 * Preferred source: the `limits[]` array — model-scoped entries (e.g.
 * `{kind: "weekly_scoped", group: "weekly", percent, resets_at,
 * scope: {model: {display_name: "Fable"}}}`) are exactly the per-model bars
 * Claude's own UI renders. Account-wide entries have `scope: null` and are
 * skipped (the header ping covers them).
 *
 * Fallback: legacy top-level `seven_day_<model>` objects with a `utilization`
 * number (all null on current accounts, but cheap to keep).
 */
export function parseOauthUsage(body: unknown): ModelLimit[] {
	if (typeof body !== 'object' || body === null) {
		return []
	}
	const root = body as Record<string, unknown>
	const out: ModelLimit[] = []
	const seen = new Set<string>()

	if (Array.isArray(root.limits)) {
		for (const item of root.limits) {
			if (typeof item !== 'object' || item === null) {
				continue
			}
			const l = item as {
				group?: unknown
				percent?: unknown
				resets_at?: unknown
				scope?: unknown
			}
			const scope = (typeof l.scope === 'object' && l.scope !== null ? l.scope : {}) as {
				model?: unknown
			}
			const model = (typeof scope.model === 'object' && scope.model !== null ? scope.model : null) as {
				id?: unknown
				display_name?: unknown
			} | null
			const name =
				(typeof model?.id === 'string' && model.id) ||
				(typeof model?.display_name === 'string' && model.display_name) ||
				null
			if (!name || typeof l.percent !== 'number') {
				continue
			}
			const window = l.group === 'session' ? '5h' : l.group === 'weekly' ? '7d' : '7d'
			const key = modelKeyOf(name)
			out.push({
				model: key,
				pct: clampPct(l.percent),
				resetsAt: typeof l.resets_at === 'string' ? parseReset(l.resets_at) : null,
				window,
			})
			seen.add(`${window}:${key}`)
		}
	}

	for (const [key, val] of Object.entries(root)) {
		const m = key.match(/^(five_hour|seven_day)_([a-z0-9_]+)$/)
		if (!m || typeof val !== 'object' || val === null) {
			continue
		}
		const entry = val as { utilization?: unknown; resets_at?: unknown }
		if (typeof entry.utilization !== 'number') {
			continue
		}
		const window = m[1] === 'five_hour' ? '5h' : '7d'
		if (seen.has(`${window}:${m[2]}`)) {
			continue
		}
		out.push({
			model: m[2],
			pct: clampPct(entry.utilization),
			resetsAt: typeof entry.resets_at === 'string' ? parseReset(entry.resets_at) : null,
			window,
		})
	}
	return out
}

/**
 * Read the account's real rate-limit utilization. Sends a 1-token ping to the
 * Messages API; Anthropic returns the unified 5h/7d utilization in response
 * headers (same approach as Claude-Usage-Tracker's OAuth path).
 */
export async function fetchLimits(creds: ClaudeCreds): Promise<LimitsReport> {
	const headers: Record<string, string> = {
		'anthropic-version': '2023-06-01',
		'content-type': 'application/json',
	}
	if (creds.source === 'sub') {
		headers['authorization'] = `Bearer ${creds.token}`
		headers['anthropic-beta'] = 'oauth-2025-04-20'
		headers['user-agent'] = 'claude-code/2.1.5 (usagefleet)'
	} else {
		headers['x-api-key'] = creds.token
	}

	const res = await fetch(MESSAGES_URL, {
		body: JSON.stringify({
			max_tokens: 1,
			messages: [{ role: 'user', content: 'hi' }],
			model: 'claude-haiku-4-5-20251001',
		}),
		headers,
		method: 'POST',
		signal: AbortSignal.timeout(15_000),
	})
	// The unified rate-limit headers are (historically) present on success AND
	// error responses — this OAuth/header-scraping path against the public
	// Messages endpoint is undocumented and may break without notice. If a
	// rejected response ALSO lacks the headers, the feature is unavailable; throw
	// so the caller logs it instead of POSTing an all-null report silently.
	// Diagnostic: dump every rate-limit header so unrecognized per-model names
	// can be discovered in the field (USAGEFLEET_DEBUG_HEADERS=1).
	if (process.env.USAGEFLEET_DEBUG_HEADERS) {
		for (const [k, v] of res.headers.entries()) {
			if (k.includes('ratelimit')) {
				console.error(`[debug] ${k}: ${v}`)
			}
		}
	}
	const report = parseLimitsHeaders(creds.source, n => res.headers.get(n), res.headers.keys())
	const gotHeaders =
		report.fiveHourPct != null ||
		report.sevenDayPct != null ||
		report.fiveHourResetsAt != null ||
		report.sevenDayResetsAt != null ||
		report.modelLimits.length > 0
	if (!res.ok && !gotHeaders) {
		throw new Error(`limits unavailable: HTTP ${res.status} with no rate-limit headers`)
	}
	// Subscription logins: merge in the per-model caps from the OAuth usage
	// endpoint (the ping headers never include them). Best-effort — keep the
	// header-derived report on any failure.
	if (creds.source === 'sub' && report.modelLimits.length === 0) {
		try {
			report.modelLimits = await fetchOauthModelLimits(creds.token)
		} catch {
			/* endpoint unavailable — report account-wide limits only */
		}
	}
	return report
}
