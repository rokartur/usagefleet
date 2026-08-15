import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Config, Store } from './types.js'

// runOnce's offset handling is the one place in the collector that can destroy
// data: advancing past records the server never accepted loses them for good.
// These tests pin exactly which upload outcomes are allowed to advance.

const uploadBatch = vi.fn()
vi.mock(import('./uploader.js'), () => ({ postLimits: vi.fn(), uploadBatch }))

const { runOnce } = await import('./collector.js')

function usageLine(uuid: string, tokens = 1): string {
	return `${JSON.stringify({
		message: {
			id: 'm',
			model: 'claude-x',
			usage: { input_tokens: tokens, output_tokens: 0 },
		},
		timestamp: '2026-01-01T00:00:00Z',
		type: 'assistant',
		uuid,
	})}\n`
}

/** A scan root holding one JSONL with `count` usage records. */
function fixture(count: number): { cfg: Config; logPath: string } {
	const dir = mkdtempSync(join(tmpdir(), 'uf-col-'))
	const projects = join(dir, 'projects')
	const logPath = join(projects, 'session.jsonl')
	mkdirSync(projects, { recursive: true })
	writeFileSync(logPath, Array.from({ length: count }, (_, i) => usageLine(`u${i}`)).join(''))
	return {
		cfg: {
			batchSize: 100,
			desktopDir: null,
			endpoint: 'https://x.test',
			piDirs: [],
			projectsDir: projects,
			storePath: join(dir, 'config.json'),
			token: 'uf_t',
		},
		logPath,
	}
}

function savedOffset(cfg: Config, logPath: string): number | undefined {
	try {
		const store = JSON.parse(readFileSync(cfg.storePath, 'utf-8')) as Store
		return store.state.files[logPath]?.offset
	} catch {
		return undefined
	}
}

afterEach(() => uploadBatch.mockReset())

describe('runOnce offset commitment', () => {
	it('advances only after the server accepts', async () => {
		const { cfg, logPath } = fixture(3)
		uploadBatch.mockResolvedValue({ accepted: 3, duplicates: 0, ok: true })

		const r = await runOnce(cfg)

		expect(r.sent).toBe(3)
		expect(r.dropped).toBe(0)
		expect(savedOffset(cfg, logPath)).toBeGreaterThan(0)
	})

	// The blocker this suite exists for: a device parked outside its plan gets a
	// 402, and advancing past it would delete that machine's usage permanently.
	it.each(['transient', 'auth', 'plan'] as const)(
		'keeps the offset on a %s failure so nothing is lost',
		async fatal => {
			const { cfg, logPath } = fixture(3)
			uploadBatch.mockResolvedValue({ fatal, ok: false })

			const r = await runOnce(cfg)

			expect(r.failed).toBeTruthy()
			expect(r.dropped).toBe(0)
			expect(savedOffset(cfg, logPath)).toBeUndefined()
		},
	)

	// The 402 flood this fixes: one line per cycle, not one per file, and no
	// pointless attempt on the remaining files that answer identically.
	it('reports a plan or transient wall once per cycle', async () => {
		const { cfg } = fixture(3)
		const lines: string[] = []
		uploadBatch.mockResolvedValue({ fatal: 'plan', ok: false })
		await runOnce(cfg, (_level, m) => lines.push(m))
		expect(lines).toHaveLength(1)
		expect(lines[0]).toContain("outside your plan's device limit")

		lines.length = 0
		uploadBatch.mockResolvedValue({ fatal: 'transient', ok: false })
		await runOnce(cfg, (_level, m) => lines.push(m))
		expect(lines).toStrictEqual(['upload failed for 1 file · retrying next cycle'])
	})

	// A malformed record must cost one record, not the whole chunk it rode in on.
	it('bisects an invalid chunk and keeps every good record', async () => {
		const { cfg, logPath } = fixture(8)
		uploadBatch.mockImplementation(async (payload: { records: { uuid: string }[] }) =>
			payload.records.some(r => r.uuid === 'u5')
				? { fatal: 'invalid', ok: false }
				: { accepted: payload.records.length, duplicates: 0, ok: true },
		)

		const r = await runOnce(cfg)

		expect(r.sent).toBe(7)
		expect(r.dropped).toBe(1)
		expect(savedOffset(cfg, logPath)).toBeGreaterThan(0)
	})

	// A 400 on the envelope (an `os` the server's enum does not know) fails every
	// record. Bisecting that to the bottom would delete the whole batch for a bug
	// an upgrade fixes, so the split has to give up and keep the offset.
	it('stops bisecting when the server rejects the batch itself', async () => {
		const { cfg, logPath } = fixture(8)
		uploadBatch.mockResolvedValue({ fatal: 'invalid', ok: false })

		const r = await runOnce(cfg)

		expect(r.failed).toBeTruthy()
		expect(r.sent).toBe(0)
		// The offset is kept, so the records probed on the way down get retried.
		expect(r.dropped).toBe(0)
		expect(savedOffset(cfg, logPath)).toBeUndefined()
	})
})
