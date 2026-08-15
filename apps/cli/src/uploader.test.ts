import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LimitsReport } from './claude-limits.js'
import type { BatchPayload, Config } from './types.js'
import { postLimits, uploadBatch } from './uploader.js'

const cfg: Config = {
	batchSize: 100,
	desktopDir: null,
	endpoint: 'https://x.test',
	piDirs: [],
	projectsDir: '',
	storePath: '',
	token: 'uf_test',
}
const payload: BatchPayload = {
	collectorVersion: '1.0.0',
	hostname: 'h',
	os: 'mac',
	records: [],
	sentAt: '2026-01-01T00:00:00Z',
}

function mockFetch(status: number, body = '{}') {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(body, { status })),
	)
}

afterEach(() => vi.unstubAllGlobals())

describe('uploadBatch failure classification', () => {
	it('2xx → ok with counts', async () => {
		mockFetch(200, JSON.stringify({ accepted: 3, duplicates: 1 }))
		await expect(uploadBatch(payload, cfg)).resolves.toStrictEqual({
			accepted: 3,
			duplicates: 1,
			ok: true,
		})
	})

	it('401 → auth (revoked/expired token; keep offset, surface loudly)', async () => {
		mockFetch(401)
		await expect(uploadBatch(payload, cfg)).resolves.toStrictEqual({
			fatal: 'auth',
			ok: false,
		})
	})

	it('403 → auth', async () => {
		mockFetch(403)
		await expect(uploadBatch(payload, cfg)).resolves.toStrictEqual({
			fatal: 'auth',
			ok: false,
		})
	})

	it('400 → invalid (malformed; skip past to avoid a stall)', async () => {
		mockFetch(400)
		await expect(uploadBatch(payload, cfg)).resolves.toStrictEqual({
			fatal: 'invalid',
			ok: false,
		})
	})

	it('422 → invalid', async () => {
		mockFetch(422)
		await expect(uploadBatch(payload, cfg)).resolves.toStrictEqual({
			fatal: 'invalid',
			ok: false,
		})
	})

	// 402 is what the server answers for a device parked outside its plan: the
	// records are fine, but retrying the next file is pointless — it answers the
	// same, so the caller stops the cycle and reports it once.
	it('402 → plan (device over the account limit; keep the offset)', async () => {
		mockFetch(402)
		await expect(uploadBatch(payload, cfg)).resolves.toStrictEqual({
			fatal: 'plan',
			ok: false,
		})
	})

	// "invalid" is the one verdict that lets the caller advance past data and lose
	// it forever, so it is a whitelist: anything not provably malformed retries.
	it.each([404, 408, 409, 413, 451])('%i → transient (the records are fine; keep the offset)', async status => {
		mockFetch(status)
		await expect(uploadBatch(payload, cfg)).resolves.toStrictEqual({
			fatal: 'transient',
			ok: false,
		})
	})
})

// This leg runs every cycle even when no usage records moved, so a plan-walled
// device is the case that decides between one actionable warning and an
// anonymous "limits upload failed" every five minutes, forever.
describe(postLimits, () => {
	const report: LimitsReport = {
		fiveHourPct: 10,
		fiveHourResetsAt: null,
		modelLimits: [],
		sevenDayPct: 20,
		sevenDayResetsAt: null,
		source: 'sub',
	}

	it('2xx → ok', async () => {
		mockFetch(200)
		await expect(postLimits(report, cfg)).resolves.toBe('ok')
	})

	it('402 → plan, not a bare failure', async () => {
		mockFetch(402)
		await expect(postLimits(report, cfg)).resolves.toBe('plan')
	})

	it('401 → auth', async () => {
		mockFetch(401)
		await expect(postLimits(report, cfg)).resolves.toBe('auth')
	})

	// Single-shot by design: 5xx and a dead network both wait for the next cycle.
	it.each([500, 503])('%i → transient', async status => {
		mockFetch(status)
		await expect(postLimits(report, cfg)).resolves.toBe('transient')
	})

	it('network error → transient', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED')
			}),
		)
		await expect(postLimits(report, cfg)).resolves.toBe('transient')
	})
})
