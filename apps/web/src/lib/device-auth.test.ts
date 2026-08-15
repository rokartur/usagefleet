import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// authenticateDevice needs a device lookup; the policy under test is which
// requests are allowed to reach that lookup, so the row it returns is all the
// database that matters here.
const lookup = vi.fn<() => Promise<unknown[]>>()

vi.mock(import('@/db'), () => ({
	db: {
		select: () => ({
			from: () => ({ where: () => ({ limit: lookup }) }),
		}),
	},
}))
vi.mock(import('@/db/schema'), () => ({
	devices: { id: 'id', tokenHash: 'tokenHash' },
}))

const { authenticateDevice } = await import('./device-auth')
const { hashToken } = await import('./device-token')

const VALID = 'uf_valid_token'
const device = {
	id: 'd1',
	revoked: false,
	tokenHash: hashToken(VALID),
	userId: 'u1',
}

function req(token: string, ip?: string): Request {
	const headers: Record<string, string> = { 'x-api-key': token }
	if (ip) {
		headers['x-forwarded-for'] = ip
	}
	return new Request('http://x.test/api/v1/usage', { headers, method: 'POST' })
}

beforeEach(() => {
	lookup.mockImplementation(async () => [])
})

afterEach(() => {
	vi.unstubAllEnvs()
	vi.clearAllMocks()
})

describe('authenticateDevice', () => {
	it('rejects an unknown token', async () => {
		const scope = `s${Math.random()}`
		const res = await authenticateDevice(req('uf_nope'), scope)
		expect('response' in res && res.response.status).toBe(401)
	})

	it('authenticates a known token', async () => {
		lookup.mockImplementation(async () => [device])
		const scope = `s${Math.random()}`
		const res = await authenticateDevice(req(VALID), scope)
		expect('device' in res && res.device).toStrictEqual(device)
	})

	it('rejects a revoked device even though its token still resolves', async () => {
		lookup.mockImplementation(async () => [{ ...device, revoked: true }])
		const scope = `s${Math.random()}`
		const res = await authenticateDevice(req(VALID), scope)
		expect('response' in res && res.response.status).toBe(401)
	})

	it("throttles tokenless callers on a budget of its own, not the device's", async () => {
		const scope = `s${Math.random()}`
		const bare = () => new Request('http://x.test', { method: 'POST' })

		// ANON_LIMIT is 60/min and deliberately independent of the per-device limit
		// passed in below, so a chatty device allowance never widens this one.
		const statuses: number[] = []
		for (let i = 0; i < 62; i++) {
			const res = await authenticateDevice(bare(), scope, 240)
			if ('response' in res) {
				statuses.push(res.response.status)
			}
		}
		expect(statuses.filter(s => s === 401)).toHaveLength(60)
		expect(statuses.filter(s => s === 429)).toHaveLength(2)
	})

	// The miss budget is charged to the caller's IP. Without a trusted proxy
	// clientIp is the constant "anon", so every caller shares one bucket — if that
	// bucket could refuse requests, anyone could spend it with forged tokens and
	// take the whole fleet offline. Misses must never gate the shared bucket.
	it('keeps serving valid tokens after forged ones flood the shared bucket', async () => {
		vi.stubEnv('TRUST_PROXY', 'false')
		const scope = `s${Math.random()}`

		for (let i = 0; i < 50; i++) {
			const res = await authenticateDevice(req(`uf_forged_${i}`), scope)
			expect('response' in res && res.response.status).toBe(401)
		}

		lookup.mockImplementation(async () => [device])
		const res = await authenticateDevice(req(VALID), scope)
		expect('device' in res && res.device).toStrictEqual(device)
	})

	// With a trusted proxy the misses are attributable, so the gate does engage —
	// and only against the IP that spent it.
	it('throttles a single IP that keeps presenting bad tokens', async () => {
		vi.stubEnv('TRUST_PROXY', '1')
		const scope = `s${Math.random()}`
		const attacker = '203.0.113.9'

		let sawThrottle = false
		for (let i = 0; i < 40; i++) {
			const res = await authenticateDevice(req(`uf_forged_${i}`, attacker), scope)
			if ('response' in res && res.response.status === 429) {
				sawThrottle = true
			}
		}
		expect(sawThrottle).toBeTruthy()

		// A different IP is unaffected, and its valid token still works.
		lookup.mockImplementation(async () => [device])
		const other = await authenticateDevice(req(VALID, '198.51.100.4'), scope)
		expect('device' in other && other.device).toStrictEqual(device)
	})

	// A forged token must not reach the database once its IP is cut off.
	it('stops hitting the database for a throttled IP', async () => {
		vi.stubEnv('TRUST_PROXY', '1')
		const scope = `s${Math.random()}`
		const attacker = '203.0.113.10'

		for (let i = 0; i < 40; i++) {
			await authenticateDevice(req(`uf_forged_${i}`, attacker), scope)
		}
		const callsAfterThrottle = lookup.mock.calls.length

		for (let i = 0; i < 10; i++) {
			await authenticateDevice(req(`uf_more_${i}`, attacker), scope)
		}
		expect(lookup).toHaveBeenCalledTimes(callsAfterThrottle)
	})
})
