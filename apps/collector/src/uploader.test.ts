import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BatchPayload, Config } from './types.js'
import { uploadBatch } from './uploader.js'

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

	// "invalid" is the one verdict that lets the caller advance past data and lose
	// it forever, so it is a whitelist: anything not provably malformed retries.
	// 402 is what the server answers for a device parked outside its plan —
	// classifying that as invalid silently shredded the machine's whole history.
	it.each([402, 404, 408, 409, 413, 451])('%i → transient (the records are fine; keep the offset)', async status => {
		mockFetch(status)
		await expect(uploadBatch(payload, cfg)).resolves.toStrictEqual({
			fatal: 'transient',
			ok: false,
		})
	})
})
