import { versionParts } from './models'
import type { TokenCounts, UsageRecord } from './types'

/** USD per 1M tokens. Public Claude API list prices from
 *  https://platform.claude.com/docs/en/about-claude/pricing — used only for the
 *  optional $ column, not for limit math.
 *
 *  `cacheWrite` is the 1-hour write rate (2× base input), used only when a user
 *  opts into 1h caching. The default 5m rate is derived as 1.25× base input.
 *  `cacheRead` is the cache-hit rate (0.1× base input). */
interface Price {
	input: number
	output: number
	cacheWrite: number
	cacheRead: number
}

/** One record's list-price cost, per token bucket. Same keys as {@link Price}
 *  so a per-bucket weight vector shares the shape. Sums to the total USD. */
export type CostBuckets = Price

// Fable 5 / Mythos 5: the frontier tier ($10/$50 per MTok).
const FABLE: Price = { cacheRead: 1, cacheWrite: 20, input: 10, output: 50 }
// Opus 4.5 and later (4.5 / 4.6 / 4.7 / 4.8): the current Opus tier.
const OPUS_CURRENT: Price = {
	cacheRead: 0.5,
	cacheWrite: 10,
	input: 5,
	output: 25,
}
// Opus 4.0 / 4.1 (deprecated/retired): the legacy Opus tier.
const OPUS_LEGACY: Price = {
	cacheRead: 1.5,
	cacheWrite: 30,
	input: 15,
	output: 75,
}
// Sonnet 3.5 / 4 / 4.5 / 4.6 all share one rate.
const SONNET: Price = { cacheRead: 0.3, cacheWrite: 6, input: 3, output: 15 }
// Haiku 4.5 (current tier).
const HAIKU_CURRENT: Price = {
	cacheRead: 0.1,
	cacheWrite: 2,
	input: 1,
	output: 5,
}
// Haiku 3.5 (legacy tier).
const HAIKU_LEGACY: Price = {
	cacheRead: 0.08,
	cacheWrite: 1.6,
	input: 0.8,
	output: 4,
}

/** Comparable version number ("opus-4-8" → 4.8, "opus-5" → 5). Minor is a single
 *  digit in practice, so major + minor/10 orders versions correctly. */
function versionOf(m: string): number | null {
	const [major, minor] = versionParts(m)
	return major ? Number(major) + Number(minor ?? 0) / 10 : null
}

/** Anthropic publishes no pricing API, so we read LiteLLM's community-maintained
 *  price map (per-token, incl. cache rates) and fall back to the tiers above for
 *  ids it doesn't list or when the fetch fails. */
const PRICE_SOURCE = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

/** model id (lowercase) → list price, populated by refreshPrices(). */
const fetched = new Map<string, Price>()

const PRICE_TTL_MS = 86_400_000
/** How long a failed attempt holds the slot. Long enough that a hard outage
 *  can't turn every dashboard load into an outbound fetch, short enough that a
 *  single bad boot doesn't pin the fallback tiers for a whole day. */
const PRICE_RETRY_MS = 60_000

let nextRefreshAt = 0

/** Refresh the fetched price map, at most once a day per process. Never throws:
 *  a failure leaves whatever we already have (or the hardcoded tiers) in place.
 *  Call before pricing anything; the priceFor() callers are all sync. */
export async function refreshPrices(): Promise<void> {
	if (Date.now() < nextRefreshAt) {
		return
	}
	// Claim a short slot first so parallel loads don't stampede. Only a run that
	// actually parsed prices extends it to a full day.
	nextRefreshAt = Date.now() + PRICE_RETRY_MS
	try {
		const res = await fetch(PRICE_SOURCE, {
			signal: AbortSignal.timeout(10_000),
		})
		if (!res.ok) {
			return
		}
		const data = (await res.json()) as Record<string, Record<string, unknown>>
		for (const [id, m] of Object.entries(data)) {
			const input = m?.input_cost_per_token
			const output = m?.output_cost_per_token
			if (m?.litellm_provider !== 'anthropic') {
				continue
			}
			if (typeof input !== 'number' || typeof output !== 'number') {
				continue
			}
			// The feed's bare cache_creation cost is the 5m rate; cacheWrite here is 1h.
			const write = m.cache_creation_input_token_cost_above_1hr
			const read = m.cache_read_input_token_cost
			fetched.set(id.toLowerCase(), {
				cacheRead: (typeof read === 'number' ? read : input * 0.1) * 1e6,
				cacheWrite: (typeof write === 'number' ? write : input * 2) * 1e6,
				input: input * 1e6,
				output: output * 1e6,
			})
		}
		nextRefreshAt = Date.now() + PRICE_TTL_MS
	} catch {
		// offline / rate-limited / malformed — keep the previous prices and retry soon
	}
}

export function priceFor(model: string | null | undefined): Price {
	if (!model) {
		return SONNET
	} // unknown → sonnet-tier fallback
	const m = model.toLowerCase()
	// Exact id first, then progressively looser: "claude-opus-5[1m]" → "claude-opus-5",
	// "claude-opus-4-8-20251101" → "claude-opus-4-8" (dated snapshots the feed omits).
	const base = m.replace(/\[.*$/, '')
	const live = fetched.get(m) ?? fetched.get(base) ?? fetched.get(base.replace(/-\d{8}$/, ''))
	if (live) {
		return live
	}
	const v = versionOf(m)
	if (m.includes('fable') || m.includes('mythos')) {
		return FABLE
	}
	if (m.includes('opus')) {
		return v !== null && v < 4.5 ? OPUS_LEGACY : OPUS_CURRENT
	}
	if (m.includes('haiku')) {
		return v !== null && v < 4.5 ? HAIKU_LEGACY : HAIKU_CURRENT
	}
	return SONNET
}

/** Cache-write TTL the user's tool writes: prices differ (5m = 1.25× input,
 *  1h = 2× input). Claude Code writes 5m caches unless ENABLE_PROMPT_CACHING_1H
 *  is set, so 5m is the default. Only a fallback: rows whose log carried the
 *  per-TTL breakdown are priced by it exactly. */
export type CacheTtl = '5m' | '1h'

/** USD list-price cost of a set of token counts, split by token bucket.
 *  Anthropic's limit meter does not weigh the four buckets the way its price
 *  list does (measurably: cache reads cost ~50× less than output but barely
 *  move the limit at all), so calibration fits a multiplier per bucket — which
 *  only works if the buckets it fits are exactly the ones the total is made of.
 *  Hence one decomposition, summed by {@link costForTokens}. */
export function costBuckets(t: TokenCounts, model: string | null, ttl: CacheTtl = '5m'): CostBuckets {
	const p = priceFor(model)
	const write5m = p.input * 1.25
	const five = t.cacheCreation5mTokens ?? 0
	const oneHour = t.cacheCreation1hTokens ?? 0
	const untagged = Math.max(0, t.cacheCreationTokens - five - oneHour)
	return {
		cacheRead: (t.cacheReadTokens * p.cacheRead) / 1_000_000,
		cacheWrite:
			(five * write5m + oneHour * p.cacheWrite + untagged * (ttl === '5m' ? write5m : p.cacheWrite)) / 1_000_000,
		input: (t.inputTokens * p.input) / 1_000_000,
		output: (t.outputTokens * p.output) / 1_000_000,
	}
}

/** USD cost of a set of token counts under one model's list price.
 *  Cache writes use the per-TTL breakdown where the row carries it; only the
 *  untagged remainder (legacy rows, pi rows) is priced by the `ttl` setting. */
export function costForTokens(t: TokenCounts, model: string | null, ttl: CacheTtl = '5m'): number {
	const b = costBuckets(t, model, ttl)
	return b.input + b.output + b.cacheWrite + b.cacheRead
}

/** Cost of one record in USD. */
export function costUsd(e: UsageRecord, ttl: CacheTtl = '5m'): number {
	return costForTokens(e, e.model, ttl)
}
