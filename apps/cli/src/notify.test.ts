import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installNotifierApp } from './notify.js'

describe(installNotifierApp, () => {
	it('replaces the installed app only when the bundled build changed', () => {
		const dir = mkdtempSync(join(tmpdir(), 'usagefleet-notifier-'))
		const from = join(dir, 'bundled.app')
		const to = join(dir, 'Application Support', 'UsageFleet.app')
		const writeBuild = (bytes: string) => {
			mkdirSync(join(from, 'Contents', 'MacOS'), { recursive: true })
			writeFileSync(join(from, 'Contents', 'MacOS', 'usagefleet-notifier'), bytes)
		}
		const installed = () => readFileSync(join(to, 'Contents', 'MacOS', 'usagefleet-notifier'), 'utf-8')

		writeBuild('v1')
		installNotifierApp(from, to)
		expect(installed()).toBe('v1')

		writeFileSync(join(to, 'kept'), '')
		installNotifierApp(from, to)
		expect(existsSync(join(to, 'kept'))).toBeTruthy()

		writeBuild('v2')
		installNotifierApp(from, to)
		expect(installed()).toBe('v2')
		expect(existsSync(join(to, 'kept'))).toBeFalsy()
	})
})
