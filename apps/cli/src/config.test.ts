import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, resolvePiDirs } from './config.js'

const realEnv = { ...process.env }
afterEach(() => {
	process.env = { ...realEnv }
})

/** Points the CLI at a scratch config file holding `store`. */
function withStore(store: Record<string, unknown>): void {
	const path = join(mkdtempSync(join(tmpdir(), 'uf-config-')), 'config.json')
	writeFileSync(path, JSON.stringify(store))
	process.env.USAGEFLEET_CONFIG = path
	delete process.env.USAGEFLEET_TOKEN
}

describe(loadConfig, () => {
	it('still requires a token', () => {
		withStore({})
		expect(() => loadConfig()).toThrow(/USAGEFLEET_TOKEN/)
	})

	// `login <token>` reaches loadConfig by setting this var, so env outranking the
	// file is what makes an explicit token win over a stale store. Flip this
	// precedence and `login <new>` silently keeps the old one.
	it('prefers env over the config file', () => {
		withStore({ token: 'uf_old' })
		process.env.USAGEFLEET_TOKEN = 'uf_new'
		expect(loadConfig()).toMatchObject({ token: 'uf_new' })
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
