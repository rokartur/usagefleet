import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installPiGuard, piGuardExtension, piGuardPath, uninstallPiGuard } from './pi-hook.js'

const PROG = ['/usr/bin/node', '/opt/usagefleet/index.js', 'guard']

describe(piGuardExtension, () => {
	it('bakes the guard command and refuses only on its exit 2', () => {
		const src = piGuardExtension(PROG)
		expect(src).toContain(JSON.stringify(PROG))
		expect(src).toContain('code === 2')
		expect(src).toContain('const ENV = process.env')
	})

	it('carries USAGEFLEET_CONFIG so a second account blocks against itself', () => {
		expect(piGuardExtension(PROG, '/home/x/.config/usagefleet/work.json')).toContain(
			'USAGEFLEET_CONFIG: "/home/x/.config/usagefleet/work.json"',
		)
	})
})

describe(installPiGuard, () => {
	let agentDir: string
	beforeEach(() => {
		agentDir = mkdtempSync(join(tmpdir(), 'uf-pi-'))
		// Isolate from this machine's real config file and shell: the installer
		// consults readStore() and USAGEFLEET_HOOK for the hook off-switch.
		vi.stubEnv('USAGEFLEET_CONFIG', join(agentDir, 'store.json'))
		vi.stubEnv('USAGEFLEET_HOOK', '')
		vi.spyOn(console, 'log').mockImplementation(() => {})
	})
	afterEach(() => {
		rmSync(agentDir, { recursive: true, force: true })
		vi.unstubAllEnvs()
		vi.restoreAllMocks()
	})

	it('writes the extension and refreshes it when the baked path changes', () => {
		installPiGuard(PROG, agentDir)
		const path = piGuardPath(agentDir)
		expect(readFileSync(path, 'utf-8')).toContain(JSON.stringify(PROG))

		const moved = ['/new/node', '/new/index.js', 'guard']
		installPiGuard(moved, agentDir)
		expect(readFileSync(path, 'utf-8')).toContain(JSON.stringify(moved))
	})

	it('skips machines without pi instead of conjuring the directory', () => {
		const absent = join(agentDir, 'nope')
		installPiGuard(PROG, absent)
		expect(existsSync(absent)).toBeFalsy()
	})

	it('honours USAGEFLEET_HOOK=0, same switch as the Claude hook', () => {
		vi.stubEnv('USAGEFLEET_HOOK', '0')
		installPiGuard(PROG, agentDir)
		expect(existsSync(piGuardPath(agentDir))).toBeFalsy()
	})

	it('honours `"hook": false` in the config file, env winning', () => {
		writeFileSync(join(agentDir, 'store.json'), JSON.stringify({ hook: false }))
		installPiGuard(PROG, agentDir)
		expect(existsSync(piGuardPath(agentDir))).toBeFalsy()

		vi.stubEnv('USAGEFLEET_HOOK', '1')
		installPiGuard(PROG, agentDir)
		expect(existsSync(piGuardPath(agentDir))).toBeTruthy()
	})

	it('uninstall removes ours and tolerates it already being gone', () => {
		installPiGuard(PROG, agentDir)
		uninstallPiGuard(agentDir)
		expect(existsSync(piGuardPath(agentDir))).toBeFalsy()
		uninstallPiGuard(agentDir) // no throw
	})

	it('generated source is loadable TypeScript that wires the input handler', async () => {
		mkdirSync(join(agentDir, 'extensions'), { recursive: true })
		installPiGuard(PROG, agentDir)
		const mod = (await import(/* @vite-ignore */ piGuardPath(agentDir))) as {
			default: (pi: { on: (event: string, handler: unknown) => void }) => void
		}
		const on = vi.fn()
		mod.default({ on })
		expect(on).toHaveBeenCalledWith('input', expect.any(Function))
	})
})
