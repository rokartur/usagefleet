import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { flagOff, loadConfig, positiveNumber, resolvePiDirs } from './config.js'

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

	it('reads batch from the file, env winning, server cap enforced', () => {
		withStore({ batch: 250, token: 't' })
		expect(loadConfig().batchSize).toBe(250)
		process.env.USAGEFLEET_BATCH = '10'
		expect(loadConfig().batchSize).toBe(10)
		process.env.USAGEFLEET_BATCH = '9999'
		expect(loadConfig().batchSize).toBe(1000)
	})
})

describe(positiveNumber, () => {
	it('prefers a usable env value, then the file, then nothing', () => {
		expect(positiveNumber('30', 60)).toBe(30)
		expect(positiveNumber('', 60)).toBe(60) // empty env counts as unset
		expect(positiveNumber()).toBeNull()
	})

	it('skips junk instead of trusting it', () => {
		expect(positiveNumber('abc', 60)).toBe(60)
		expect(positiveNumber('0', 60)).toBe(60)
		expect(positiveNumber('abc', -5)).toBeNull()
	})
})

describe(flagOff, () => {
	it('env wins over the file key in either direction', () => {
		expect(flagOff('0')).toBeTruthy()
		expect(flagOff('OFF', true)).toBeTruthy()
		expect(flagOff('1', false)).toBeFalsy()
	})

	it('falls back to `false` in the file, defaulting to on', () => {
		expect(flagOff('', false)).toBeTruthy() // empty env counts as unset
		expect(flagOff()).toBeFalsy()
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
