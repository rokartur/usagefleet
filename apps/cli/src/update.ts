import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { RELEASE_VERSION } from './release.js'
import type { Log } from './ui.js'

/** The published package: one artifact for every OS, installed with
 *  `npm i -g @usagefleet/cli`. */
const PACKAGE = '@usagefleet/cli'

/** Public registry, so self-update needs no server, no token and no GitHub
 *  credential — and npm verifies the tarball's integrity on the way in. */
const REGISTRY = 'https://registry.npmjs.org'

/** Semver in the shape npm accepts on a command line. The registry is remote
 *  input that ends up in an `npm install` argv (and on Windows, in a shell), so
 *  anything unexpected is dropped rather than passed along. */
const VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

/** npm from the same install as the node running us. A launchd/systemd service
 *  gets a minimal PATH that rarely has the user's node manager on it, so the
 *  bare name is only a fallback. */
function npmCommand(): string {
	const sibling = join(dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm')
	return existsSync(sibling) ? sibling : 'npm'
}

/** An `npm install` that never returns would hang the watch loop forever, since
 *  the update check is awaited inline before the next tick is scheduled: the
 *  daemon would still be "running" while collecting nothing, with an empty log.
 *  Generous enough for a slow registry on a cold cache. */
const RUN_TIMEOUT_MS = 10 * 60_000

/** Exit code of a finished child, or null when it could not be started, was
 *  killed for exceeding RUN_TIMEOUT_MS, or died on a signal. */
function run(cmd: string, args: string[]): Promise<number | null> {
	return new Promise(resolve => {
		// shell on Windows: node refuses to spawn a .cmd directly since the 2024
		// argument-injection fix. Every argument here is a literal or VERSION-checked.
		const child = spawn(cmd, args, { shell: process.platform === 'win32', stdio: 'ignore' })
		const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS)
		// Node emits 'close' after 'error' for a failed spawn, so both handlers can
		// run; `settled` makes the first one win. oxlint's promise rule sees the two
		// registrations and can't see the guard between them.
		let settled = false
		const finish = (code: number | null) => {
			if (settled) {
				return
			}
			settled = true
			clearTimeout(timer)
			// oxlint-disable-next-line promise/no-multiple-resolved
			resolve(code)
		}
		child.on('error', () => finish(null))
		child.on('close', code => finish(code))
	})
}

/**
 * Upgrade the collector in place via npm and restart the service on the new
 * version. Returns the version installed, or null when there was nothing to do.
 *
 * Every failure path is a silent no-op — a self-updater that breaks a working
 * install is worse than one that skips a release. `force` is the manual
 * `usagefleet update`, which ignores USAGEFLEET_UPDATE=0 but still refuses to
 * touch a dev build.
 *
 * `log` carries the level so the caller can pick the right glyph: the CLI
 * renders progress as a step and every dead end as a warning.
 */
export async function checkForUpdate(log: Log, force = false): Promise<string | null> {
	if (RELEASE_VERSION === 'dev') {
		if (force) {
			log('warn', 'dev build · install the published package first')
		}
		return null
	}
	// The service is restarted by re-invoking this script, so without a path to
	// it there is nothing to hand over to.
	const self = process.argv[1]
	if (!self) {
		return null
	}
	if (!force && process.env.USAGEFLEET_UPDATE === '0') {
		return null
	}

	// A rejected fetch (offline, DNS, timeout) must stay inside this function:
	// `watch` calls it mid-cycle, so a thrown error would abort the rest of that
	// cycle — the limits report included — on every tick the registry is down.
	let latest: string | undefined
	try {
		const res = await fetch(`${REGISTRY}/${PACKAGE}/latest`, { signal: AbortSignal.timeout(15_000) })
		if (!res.ok) {
			if (force) {
				log('warn', `registry has no release info (${res.status})`)
			}
			return null
		}
		latest = ((await res.json()) as { version?: string }).version
	} catch (error) {
		if (force) {
			log('warn', `npm registry unreachable · ${(error as Error).message}`)
		}
		return null
	}

	if (!latest || !VERSION.test(latest)) {
		return null
	}
	if (latest === RELEASE_VERSION) {
		if (force) {
			log('ok', `already current · ${RELEASE_VERSION}`)
		}
		return null
	}

	log('ok', `${RELEASE_VERSION} → ${latest} · installing ${PACKAGE}…`)
	const code = await run(npmCommand(), ['install', '--global', `${PACKAGE}@${latest}`])
	if (code !== 0) {
		log(
			'warn',
			code === null
				? 'npm not available · reinstall with `npm i -g @usagefleet/cli`'
				: `npm install failed (exit ${code}) · if the global prefix needs root, run it yourself`,
		)
		return null
	}

	// Detached: `login` rewrites the service definition and restarts it, which
	// kills this process tree. npm replaced the file behind `self`, so this is
	// already the new version.
	spawn(process.execPath, [self, 'login'], { detached: true, stdio: 'ignore' }).unref()
	log('ok', `installed ${latest} · restarting service`)
	return latest
}
