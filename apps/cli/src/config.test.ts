import { describe, expect, it } from 'vitest'
import { resolvePiDirs } from './config.js'

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
