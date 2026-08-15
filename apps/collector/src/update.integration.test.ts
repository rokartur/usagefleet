import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The updater only runs on release builds, and hands over by spawning the new
// binary — both have to be faked to exercise the download path at all.
vi.mock(import('./release.js'), () => ({ RELEASE_VERSION: '1.0.1' }))
const spawn = vi.fn(() => ({ unref: vi.fn() }))
vi.mock(import('node:child_process'), () => ({ spawn }))

const { assetName, checkForUpdate } = await import('./update.js')
const cfg = { endpoint: 'https://srv.test', token: 'uf_x' }
const ASSET = assetName(process.platform, process.arch) as string

/** Point the updater at a throwaway file instead of the running executable.
 *  argv[1] is set to the same path because that is what a compiled single-file
 *  build looks like — the updater refuses to run otherwise (see the script-build
 *  test below). */
function fakeBinary(contents: string): string {
	const path = join(mkdtempSync(join(tmpdir(), 'uf-upd-')), 'usagefleet')
	writeFileSync(path, contents)
	Object.defineProperty(process, 'execPath', {
		configurable: true,
		value: path,
	})
	process.argv[1] = path
	return path
}

const realExecPath = process.execPath
const realArgv1 = process.argv[1]
afterEach(() => {
	Object.defineProperty(process, 'execPath', {
		configurable: true,
		value: realExecPath,
	})
	process.argv[1] = realArgv1 as string
	vi.unstubAllGlobals()
	spawn.mockClear()
})

/** A server offering `payload` as the new binary, advertised with `advertised`. */
function stubServer(payload: string, advertised = sha256(payload)) {
	vi.stubGlobal('fetch', async (url: string) =>
		url.includes('/latest')
			? Response.json({ sha256: { [ASSET]: advertised }, tag: 'v9.9.9' })
			: new Response(payload),
	)
}

function sha256(s: string): string {
	return createHash('sha256').update(Buffer.from(s)).digest('hex')
}

describe('checkForUpdate', () => {
	it('installs a release whose checksum matches', async () => {
		const bin = fakeBinary('old binary')
		stubServer('new binary')

		// Tags carry a leading "v", the baked version does not.
		await expect(checkForUpdate(cfg, () => {})).resolves.toBe('9.9.9')
		expect(readFileSync(bin, 'utf-8')).toBe('new binary')
		expect(spawn).toHaveBeenCalledWith(bin, ['install'], expect.anything())
	})

	// The download is code we are about to execute: a wrong hash must leave the
	// working install exactly as it was.
	it('refuses a download whose checksum does not match', async () => {
		const bin = fakeBinary('old binary')
		stubServer('tampered binary', sha256('what the server promised'))

		await expect(checkForUpdate(cfg, () => {})).resolves.toBeNull()
		expect(readFileSync(bin, 'utf-8')).toBe('old binary')
		expect(spawn).not.toHaveBeenCalled()
	})

	it('stays put when the server reports the tag we already run', async () => {
		const bin = fakeBinary('old binary')
		vi.stubGlobal('fetch', async () => Response.json({ sha256: {}, tag: 'v1.0.1' }))

		await expect(checkForUpdate(cfg, () => {})).resolves.toBeNull()
		expect(readFileSync(bin, 'utf-8')).toBe('old binary')
	})

	// `watch` runs this inside its cycle: a thrown error would skip the limits
	// report on every tick while the server is unreachable.
	it('resolves null instead of throwing when the server is unreachable', async () => {
		fakeBinary('old binary')
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('fetch failed')
		})

		await expect(checkForUpdate(cfg, () => {})).resolves.toBeNull()
	})

	// The swap replaces process.execPath. Under the published `usagefleet.js`
	// bundle that is the user's own `node`, so updating would destroy their Node
	// install rather than the collector.
	it("refuses to update a script build, where execPath is the user's node", async () => {
		const bin = fakeBinary("the user's node")
		process.argv[1] = join(tmpdir(), 'usagefleet.js') // a real, separate script
		stubServer('new binary')

		await expect(checkForUpdate(cfg, () => {})).resolves.toBeNull()
		expect(readFileSync(bin, 'utf-8')).toBe("the user's node")
		expect(spawn).not.toHaveBeenCalled()
	})

	// Self-update fetches an executable and runs it: over plaintext that is RCE.
	it('refuses to self-update over a non-https endpoint', async () => {
		const bin = fakeBinary('old binary')
		stubServer('new binary')

		await expect(checkForUpdate({ endpoint: 'http://srv.test', token: 'uf_x' }, () => {})).resolves.toBeNull()
		expect(readFileSync(bin, 'utf-8')).toBe('old binary')
		expect(spawn).not.toHaveBeenCalled()
	})
})
