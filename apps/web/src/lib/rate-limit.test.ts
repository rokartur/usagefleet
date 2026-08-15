import { type } from 'arktype'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { budgetExhausted, clientIp, rateLimit, readJsonCapped } from './rate-limit'

function req(headers: Record<string, string>): Request {
	return new Request('http://x.test', { headers })
}

const orig = process.env.TRUST_PROXY
afterEach(() => {
	if (orig === undefined) {
		delete process.env.TRUST_PROXY
	} else {
		process.env.TRUST_PROXY = orig
	}
})

describe(clientIp, () => {
	it('ignores forgeable X-Forwarded-For when no proxy is trusted (default)', () => {
		delete process.env.TRUST_PROXY
		expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe('anon')
	})

	it('ignores X-Forwarded-For when TRUST_PROXY=false', () => {
		process.env.TRUST_PROXY = 'false'
		expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('anon')
	})

	it('reads the rightmost (proxy-appended) entry with TRUST_PROXY=true', () => {
		process.env.TRUST_PROXY = 'true'
		// attacker forged 9.9.9.9; our single proxy appended the real client IP
		expect(clientIp(req({ 'x-forwarded-for': '9.9.9.9, 5.6.7.8' }))).toBe('5.6.7.8')
	})

	it('skips N proxy hops from the right with TRUST_PROXY=2', () => {
		process.env.TRUST_PROXY = '2'
		// forged, real-client, proxy1  → 2 trusted hops → real client at index len-2
		expect(clientIp(req({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1')
	})

	it('falls back to the shared bucket when TRUST_PROXY overstates the hop count', () => {
		process.env.TRUST_PROXY = '3'
		// Every entry here is attacker-supplied, including X-Real-IP: this branch is
		// reached precisely when the request did not come through the proxy that
		// would have overwritten these. Honouring either would let the caller pick
		// their own rate-limit key and mint a fresh bucket per request.
		expect(clientIp(req({ 'x-forwarded-for': '9.9.9.9', 'x-real-ip': '8.8.8.8' }))).toBe('anon')
	})

	it('never trusts X-Real-IP, with or without a trusted proxy', () => {
		for (const trust of ['true', '2', 'false']) {
			process.env.TRUST_PROXY = trust
			expect(clientIp(req({ 'x-real-ip': '8.8.8.8' }))).toBe('anon')
		}
	})
})

describe('bucket eviction', () => {
	// The map is capped, so a flood of unique keys must evict something. Evicting
	// a bucket that is already refusing requests would hand the flooder a reset,
	// which is the opposite of what the limiter is for.
	it('keeps an active throttle alive through a unique-key flood', () => {
		const victim = `victim:${Math.random()}`

		expect(rateLimit(victim, 1, 60_000).ok).toBeTruthy()
		expect(rateLimit(victim, 1, 60_000).ok).toBeFalsy() // now at its limit

		for (let i = 0; i < 12_000; i++) {
			rateLimit(`flood:${Math.random()}:${i}`, 100, 60_000)
		}

		expect(rateLimit(victim, 1, 60_000).ok).toBeFalsy()
	})
})

describe(budgetExhausted, () => {
	it('reports exhaustion without consuming budget', () => {
		const key = `miss:${Math.random()}`
		expect(budgetExhausted(key, 2)).toBeFalsy()

		rateLimit(key, 2, 60_000)
		// A pure check must not advance the count, however often it is called.
		expect(budgetExhausted(key, 2)).toBeFalsy()
		expect(budgetExhausted(key, 2)).toBeFalsy()

		rateLimit(key, 2, 60_000)
		expect(budgetExhausted(key, 2)).toBeTruthy()
	})
})

describe(readJsonCapped, () => {
	// No content-length, exactly like a chunked upload: a header-only size check
	// never sees this body at all.
	function chunked(body: string): Request {
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(new TextEncoder().encode(body))
				c.close()
			},
		})
		return new Request('http://x.test', {
			method: 'POST',
			body: stream,
			// @ts-expect-error undici needs this for a stream body; absent from lib.dom.
			duplex: 'half',
		})
	}

	it('parses a body under the cap and returns it typed by the schema', async () => {
		const parsed = await readJsonCapped(chunked('{"a":1}'), 1024, type({ a: 'number' }))
		expect(parsed).toStrictEqual({ ok: true, value: { a: 1 } })
		// The value is the schema's output type, not `unknown`: this line is the
		// assertion, and stops compiling if the generic ever widens back.
		if (parsed.ok) {
			expectTypeOf(parsed.value.a).toEqualTypeOf<number>()
		}
	})

	/** Status of the refusal, or "accepted" when the body was let through. */
	async function refusal(
		req: Request,
		cap: number,
		schema: Parameters<typeof readJsonCapped>[2] = type('unknown'),
	): Promise<number | 'accepted'> {
		const r = await readJsonCapped(req, cap, schema)
		return r.ok ? 'accepted' : r.response.status
	}

	// The size and JSON checks run before the schema, so a refusal must not be
	// reported as a size problem just because the shape is wrong.
	it('reports a well-formed body of the wrong shape as 400', async () => {
		await expect(refusal(chunked('{"a":"not a number"}'), 1024, type({ a: 'number' }))).resolves.toBe(400)
	})

	it('rejects an oversized body that declares no content-length', async () => {
		const big = JSON.stringify({ pad: 'x'.repeat(5000) })
		await expect(refusal(chunked(big), 1024)).resolves.toBe(413)
	})

	it('rejects a declared content-length over the cap before reading the body', async () => {
		const req = new Request('http://x.test', {
			body: '{}',
			headers: { 'content-length': '999999' },
			method: 'POST',
		})
		await expect(refusal(req, 1024)).resolves.toBe(413)
	})

	it('reports malformed JSON as 400, not 413', async () => {
		await expect(refusal(chunked('not json'), 1024)).resolves.toBe(400)
	})
})
