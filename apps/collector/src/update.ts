import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { isSecureEndpoint } from './config.js'
import { RELEASE_TAG } from './release.js'
import { looksLikeCompiledBinary } from './service.js'
import type { Config } from './types.js'

/** Release asset for this machine, mirroring the names install.sh downloads.
 *  Null on a platform we don't publish a binary for. */
export function assetName(platform: string, arch: string): string | null {
	const os =
		platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : platform === 'win32' ? 'windows' : null
	const cpu = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : null
	if (!os || !cpu) {
		return null
	}
	if (os === 'windows') {
		return cpu === 'x64' ? 'usagefleet-windows-x64.exe' : null
	}
	return `usagefleet-${os}-${cpu}`
}

interface LatestResponse {
	tag?: string
	sha256?: Record<string, string>
}

/**
 * Replace `target` with a freshly downloaded binary. Rename-aside rather than
 * write-in-place: the file is usually the executable of the running process,
 * which POSIX refuses to overwrite (ETXTBSY) and Windows locks outright.
 */
export function swapIn(downloaded: string, target: string): void {
	const old = `${target}.old`
	rmSync(old, { force: true })
	renameSync(target, old)
	try {
		renameSync(downloaded, target)
	} catch (error) {
		// The target path is now empty and it is the service's ExecStart: without
		// this rollback a failed swap (ENOSPC, EPERM, AV interference) leaves the
		// machine with no collector binary at all and only a reinstall fixes it.
		renameSync(old, target)
		throw error
	}
	try {
		chmodSync(target, 0o755)
	} catch {
		/* non-POSIX fs */
	}
	try {
		rmSync(old, { force: true })
	} catch {
		// Windows keeps the old image locked while this process lives, and throwing
		// here would abort a swap that already succeeded — so the caller would never
		// spawn `install` and the service would never restart onto the new binary.
		// `install` sweeps the leftover.
	}
}

/**
 * Pull a newer collector binary from the server (which proxies GitHub Releases)
 * and hand over to it. Returns the new tag when an update was started.
 *
 * Every failure path is a silent no-op — a self-updater that breaks a working
 * install is worse than one that skips a release. `force` is the manual
 * `usagefleet update`, which ignores USAGEFLEET_UPDATE=0 but still refuses
 * to touch a dev build.
 */
export async function checkForUpdate(
	cfg: Pick<Config, 'endpoint' | 'token'>,
	log: (msg: string) => void,
	force = false,
): Promise<string | null> {
	if (RELEASE_TAG === 'dev') {
		if (force) {
			log('update: this is a dev build — install a release binary first.')
		}
		return null
	}
	// The swap replaces process.execPath, which is only the collector when this is
	// a compiled single-file binary. Under the published `usagefleet.js` bundle
	// execPath is the user's own `node`, and updating would overwrite it.
	if (!looksLikeCompiledBinary(process.argv[1], process.execPath)) {
		if (force) {
			log('update: script build — re-run install.sh to get the self-updating binary.')
		}
		return null
	}
	// Self-update fetches an executable and runs it, so a MITM on a plaintext
	// endpoint is remote code execution. loadConfig already rejects non-https,
	// but this path is too dangerous to depend on a caller upstream.
	if (!isSecureEndpoint(cfg.endpoint)) {
		if (force) {
			log('update: refusing to self-update over a non-https endpoint.')
		}
		return null
	}
	if (!force && process.env.USAGEFLEET_UPDATE === '0') {
		return null
	}

	const asset = assetName(process.platform, process.arch)
	if (!asset) {
		return null
	}

	const res = await fetch(`${cfg.endpoint}/api/v1/collector/latest`, {
		headers: { 'x-api-key': cfg.token },
		signal: AbortSignal.timeout(15_000),
	})
	if (!res.ok) {
		if (force) {
			log(`update: server has no release info (${res.status}).`)
		}
		return null
	}
	const latest = (await res.json()) as LatestResponse
	if (!latest.tag || latest.tag === RELEASE_TAG) {
		if (force) {
			log(`update: already on ${RELEASE_TAG}.`)
		}
		return null
	}

	const want = latest.sha256?.[asset]
	if (!want) {
		log(`update: ${latest.tag} has no checksum for ${asset} — skipping.`)
		return null
	}

	// Download next to the binary we're replacing: same filesystem, so the swap
	// is an atomic rename rather than a copy that could tear.
	const target = process.execPath
	const tmp = join(dirname(target), `.${basename(target)}.download`)
	log(`update: ${RELEASE_TAG} → ${latest.tag}, downloading ${asset}…`)
	try {
		const dl = await fetch(`${cfg.endpoint}/api/v1/collector/download?asset=${encodeURIComponent(asset)}`, {
			headers: { 'x-api-key': cfg.token },
			signal: AbortSignal.timeout(300_000),
		})
		if (!dl.ok) {
			log(`update: download failed (${dl.status}).`)
			return null
		}
		// ponytail: buffers the whole ~60 MB binary to verify it before anything
		// touches disk. Stream to a temp file and hash on the fly if that spike
		// ever matters on a small box.
		const bytes = Buffer.from(await dl.arrayBuffer())
		const got = createHash('sha256').update(bytes).digest('hex')
		if (got !== want) {
			log(`update: checksum mismatch for ${asset} — refusing to install.`)
			return null
		}
		writeFileSync(tmp, bytes, { mode: 0o755 })
		swapIn(tmp, target)
	} catch (error) {
		rmSync(tmp, { force: true })
		log(`update: ${(error as Error).message}`)
		return null
	}

	// Detached: `install` restarts the service, which kills this process tree.
	const child = spawn(target, ['install'], { detached: true, stdio: 'ignore' })
	child.unref()
	log(`update: installed ${latest.tag}, restarting service.`)
	return latest.tag
}
