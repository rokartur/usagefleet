// Lightweight in-memory fixed-window rate limiter. Adequate for a self-hosted
// single-instance deployment; swap for a shared store if you scale horizontally.

import { type } from 'arktype'
import type { Type } from 'arktype'

interface Bucket {
	count: number
	resetAt: number
	/** Kept so eviction can tell a bucket that is actively refusing requests from
	 *  one that is merely occupying space. */
	limit: number
}

const buckets = new Map<string, Bucket>()

export interface RateResult {
	ok: boolean
	/** Seconds until the window resets (for Retry-After). */
	retryAfter: number
}

/** Hard ceiling on distinct live buckets, so a flood of unique keys cannot
 *  exhaust memory (and cannot make the prune below an unbounded scan). */
const MAX_BUCKETS = 10_000

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
	const now = Date.now()

	if (buckets.size >= MAX_BUCKETS) {
		// Drop what is not currently refusing anything: an expired window enforces
		// nothing, and neither does a bucket still under its limit. A bucket AT its
		// limit is actively throttling someone, so evicting it would hand exactly
		// the caller causing the flood a free reset — those survive this pass.
		for (const [k, b] of buckets) {
			if (buckets.size < MAX_BUCKETS) {
				break
			}
			if (b.resetAt <= now || b.count < b.limit) {
				buckets.delete(k)
			}
		}
		// Still full means every remaining bucket is actively throttling. Nothing
		// can be freed without losing enforcement, so stay bounded by dropping the
		// oldest-inserted (Map keeps insertion order) and accept the reset.
		for (const k of buckets.keys()) {
			if (buckets.size < MAX_BUCKETS) {
				break
			}
			buckets.delete(k)
		}
	}

	let b = buckets.get(key)
	if (!b || b.resetAt <= now) {
		b = { count: 0, limit, resetAt: now + windowMs }
		buckets.set(key, b)
	}
	b.count += 1
	if (b.count > limit) {
		return {
			ok: false,
			retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
		}
	}
	return { ok: true, retryAfter: 0 }
}

/** Whether TRUST_PROXY names a proxy whose forwarded headers we accept. Off (the
 *  shipped default) means client-supplied headers are ignored entirely, so every
 *  pre-auth throttle falls back to one shared bucket. Exported because auth.ts
 *  gates its own proxy warning on the same answer — two readings of this env var
 *  that disagreed would leave a half-configured deployment silent. */
export function proxyTrusted(): boolean {
	const trust = process.env.TRUST_PROXY
	return !!trust && trust !== 'false' && trust !== '0'
}

/**
 * Rate-limit key derived from the client IP.
 *
 * `X-Forwarded-For` is client-controlled, so trusting its leftmost value lets an
 * attacker mint a fresh bucket per request and defeat the pre-auth throttle. We
 * only parse it when `TRUST_PROXY` is set (the operator runs a reverse proxy
 * that appends a trustworthy entry), and then read from the RIGHT — the entries
 * your own infrastructure appended — skipping `hops` proxies. Leftmost (forged)
 * entries are ignored, including when the header is shorter than `hops`: that
 * means TRUST_PROXY overstates the real hop count, and every remaining entry is
 * attacker-supplied, so we fall back to the shared bucket rather than trust one.
 * `X-Real-IP` is not consulted at all: a proxy that sets it overwrites the whole
 * value, so it carries no evidence of having been through one.
 *
 * The honest limit of all of this: nothing here can tell a request that actually
 * traversed the proxy from one that reached the app directly carrying a
 * hand-written `X-Forwarded-For`. Reading from the right only defeats forged
 * entries PREPENDED to a genuine chain. So TRUST_PROXY is a promise by the
 * operator that the app port is not reachable except through the proxy — which
 * is why compose publishes on 127.0.0.1 (docker-compose.yml) rather than on all
 * interfaces. Expose the port directly with TRUST_PROXY set and every limit here
 * is opt-out: the caller picks their own bucket.
 *
 * Default (no trusted proxy, which is what the shipped compose file is): ignore
 * all client-supplied headers and use a single shared bucket. Strict but
 * unspoofable — device ingestion is keyed on the token hash, not the IP, so this
 * mostly throttles anonymous spam.
 */
export function clientIp(req: Request): string {
	const trust = process.env.TRUST_PROXY
	if (!proxyTrusted()) {
		return 'anon'
	}

	const hops =
		trust === 'true' ? 1 : Number.isFinite(Number(trust)) && Number(trust) > 0 ? Math.floor(Number(trust)) : 1

	const xff = req.headers.get('x-forwarded-for')
	if (xff) {
		const parts = xff
			.split(',')
			.map(s => s.trim())
			.filter(Boolean)
		const client = parts[parts.length - hops]
		if (client) {
			return client
		}
	}
	return 'anon'
}

export function tooMany(retryAfter: number): Response {
	return Response.json({ error: 'rate limited' }, { headers: { 'retry-after': String(retryAfter) }, status: 429 })
}

/** True when `key` has already spent its budget in the current window, without
 *  consuming any of it. Pair with `rateLimit` as the spend: check this before
 *  doing work an unauthenticated caller can trigger, spend only when that work
 *  turns out to be a miss, so honest callers never draw down a shared bucket. */
export function budgetExhausted(key: string, limit: number): boolean {
	const b = buckets.get(key)
	return b !== undefined && b.resetAt > Date.now() && b.count >= limit
}

/**
 * Read and JSON-parse a request body, refusing to buffer more than `maxBytes`.
 *
 * `content-length` alone is not enough: it is absent on chunked requests, so a
 * header-only check is bypassed by simply not sending one. This counts the bytes
 * actually received and aborts mid-stream.
 *
 * Takes the caller's schema so the whole "body → typed value, or a response to
 * return" job lives here: every failure (too big, not JSON, wrong shape) comes
 * back as a ready `Response`, and `value` arrives parsed rather than `unknown`.
 */
export async function readJsonCapped<S extends Type>(
	req: Request,
	maxBytes: number,
	schema: S,
): Promise<{ ok: true; value: S['infer'] } | { ok: false; response: Response }> {
	const declared = Number(req.headers.get('content-length') ?? 0)
	if (Number.isFinite(declared) && declared > maxBytes) {
		return tooBig()
	}

	const reader = req.body?.getReader()
	if (!reader) {
		return badJson()
	}

	const chunks: Uint8Array[] = []
	let total = 0
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) {
				break
			}
			total += value.length
			if (total > maxBytes) {
				await reader.cancel()
				return tooBig()
			}
			chunks.push(value)
		}
	} catch {
		return badJson()
	}

	let raw: unknown
	try {
		raw = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))
	} catch {
		return badJson()
	}

	const parsed = schema(raw)
	return parsed instanceof type.errors
		? {
				ok: false,
				response: Response.json({ detail: parsed.summary, error: 'invalid payload' }, { status: 400 }),
			}
		: { ok: true, value: parsed }
}

function tooBig() {
	return {
		ok: false as const,
		response: Response.json({ error: 'payload too large' }, { status: 413 }),
	}
}

function badJson() {
	return {
		ok: false as const,
		response: Response.json({ error: 'invalid payload' }, { status: 400 }),
	}
}
