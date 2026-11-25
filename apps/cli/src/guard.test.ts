import { describe, expect, it, vi } from 'vitest'
import { blockMessage, runGuard } from './guard.js'

vi.mock(import('./config.js'), () => ({
	ENDPOINT: 'http://127.0.0.1:9',
	loadConfig: () => {
		throw new Error('USAGEFLEET_TOKEN is not set')
	},
	tokenFor: () => '',
}))

describe(runGuard, () => {
	it('blocks when the hook runs without a device token', async () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
		await expect(runGuard()).resolves.toBe(2)
		expect(stderr).toHaveBeenCalledWith(expect.stringContaining('usagefleet login'))
		stderr.mockRestore()
	})
})

describe(blockMessage, () => {
	it('blocks only on an explicit blocked:true', () => {
		expect(blockMessage({ blocked: true, blockedPct: 118.4, blockedWindow: 'session' })).toContain(
			'118.4% of its 5h budget',
		)
		expect(blockMessage({ blocked: true, blockedPct: 104, blockedWindow: 'weekly' })).toContain(
			'104% of its weekly budget',
		)
		expect(
			blockMessage({ blocked: true, blockedModel: 'Fable', blockedPct: 101, blockedWindow: 'weekly' }),
		).toContain('101% of its Fable weekly budget')
	})

	// Fail-open is the whole safety property: a tracker outage, an old server, or
	// a junk response must never stop someone from prompting.
	it('fails open on anything that is not an explicit block', () => {
		for (const view of [
			{},
			{ blocked: false },
			{ blockedPct: 250 },
			{ blockedWindow: 'session' as const },
			JSON.parse('{"blocked":"true"}'),
		]) {
			expect(blockMessage(view)).toBeNull()
		}
	})

	it('names the group and the reset time when the server sent them', () => {
		const msg = blockMessage({
			blocked: true,
			blockedUntil: '2026-01-01T12:00:00.000Z',
			blockedWindow: 'session',
			group: 'Backend',
		})
		expect(msg).toContain('"Backend"')
		expect(msg).toContain('Resets ')
	})

	it('omits the reset when it is missing or unparseable', () => {
		expect(blockMessage({ blocked: true, blockedUntil: 'not-a-date' })).not.toContain('Resets')
		expect(blockMessage({ blocked: true, blockedUntil: null })).not.toContain('Resets')
	})
})
