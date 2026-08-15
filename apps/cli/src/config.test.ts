import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_ENDPOINT, loadConfig, resolvePiDirs } from './config.js'

const realEnv = { ...process.env }
afterEach(() => {
	process.env = { ...realEnv }
})

/** Points the CLI at a scratch config file holding `store`. */
function withStore(store: Record<string, unknown>): void {
	const path = join(mkdtempSync(join(tmpdir(), 'uf-config-')), 'config.json')
	writeFileSync(path, JSON.stringify(store))
	process.env.USAGEFLEET_CONFIG = path
	delete process.env.USAGEFLEET_ENDPOINT
	delete process.env.USAGEFLEET_TOKEN
}

describe(loadConfig, () => {
	// `install --token` writes no endpoint, so setup on the hosted service is a
	// token and nothing else.
	it('falls back to the hosted endpoint when none is configured', () => {
		withStore({ token: 'uf_x' })
		expect(loadConfig().endpoint).toBe(DEFAULT_ENDPOINT)
	})

	it('keeps a self-hosted endpoint from the config file', () => {
		withStore({ endpoint: 'https://track.example.com/', token: 'uf_x' })
		expect(loadConfig().endpoint).toBe('https://track.example.com')
	})

	it('still requires a token', () => {
		withStore({})
		expect(() => loadConfig()).toThrow(/USAGEFLEET_TOKEN/)
	})
})

describe(resolvePiDirs, () => {
	it('disables on off/0', () => {
		expect(resolvePiDirs('off', '/x')).toStrictEqual([])
		expect(resolvePiDirs('0', '/x')).toStrictEqual([])
	})

	it('splits a comma-separated env list and trims', () => {
		expect(resolvePiDirs('/a, /b ,/a')).toStrictEqual(['/a', '/b'])
	})

	it("takes the config file's string or array when env is unset", () => {
		expect(resolvePiDirs(undefined, '/a')).toStrictEqual(['/a'])
		expect(resolvePiDirs(undefined, ['/a', '/b'])).toStrictEqual(['/a', '/b'])
	})

	it('falls back to the auto-detected defaults', () => {
		expect(resolvePiDirs().length).toBeGreaterThan(0)
	})
})
