import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, delimiter, dirname, join } from 'node:path'
import { flagOff } from './config.js'
import { RELEASE_VERSION } from './release.js'
import { readStore } from './store.js'
import type { Log } from './ui.js'
import { tilde } from './ui.js'

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

/** Every global install is a little project directory, and the lockfile at its
 *  root names the manager that owns it. npm is the one that leaves none behind,
 *  so "no lockfile" is what makes it the default rather than a guess. */
const MANAGERS = [
	{ lockfile: 'bun.lock', bin: 'bun', install: ['add', '--global'] },
	{ lockfile: 'bun.lockb', bin: 'bun', install: ['add', '--global'] },
	{ lockfile: 'pnpm-lock.yaml', bin: 'pnpm', install: ['add', '--global'] },
	{ lockfile: 'yarn.lock', bin: 'yarn', install: ['global', 'add'] },
] as const

/** The directory a global install was unpacked into: the parent of the
 *  `node_modules` holding the running code. null outside a node_modules, which
 *  is a dev checkout or a bundle — neither is ours to upgrade. */
function installRoot(script: string): string | null {
	try {
		const pkg = dirname(dirname(realpathSync(script))) // <root>/node_modules/@usagefleet/cli
		const modules = dirname(dirname(pkg))
		return basename(modules) === 'node_modules' ? dirname(modules) : null
	} catch {
		return null
	}
}

/** The version sitting on disk behind the running script — its own package.json,
 *  read fresh rather than from the baked-in RELEASE_VERSION, so it reports what
 *  an install just wrote instead of what this process started as. null when it
 *  can't be resolved, which means "don't judge". */
function installedVersion(script: string): string | null {
	const root = installRoot(script)
	if (!root) {
		return null
	}
	try {
		const manifest = join(root, 'node_modules', PACKAGE, 'package.json')
		return (JSON.parse(readFileSync(manifest, 'utf-8')) as { version?: string }).version ?? null
	} catch {
		return null
	}
}

/** A manager binary sitting next to its own global root (`~/.bun/bin/bun`,
 *  `~/.local/share/pnpm/pnpm`) beats hoping the bare name resolves: launchd and
 *  systemd hand the collector a minimal PATH that has none of them on it. */
function managerBinary(root: string, bin: string): string {
	const exe = process.platform === 'win32' ? `${bin}.cmd` : bin
	for (let dir = root; dir !== dirname(dir); dir = dirname(dir)) {
		const found = [join(dir, exe), join(dir, 'bin', exe)].find(candidate => existsSync(candidate))
		if (found) {
			return found
		}
	}
	return bin
}

/** The upgrade command for the install this collector actually runs from.
 *
 *  It matters because `npm install --global` only ever writes to npm's own
 *  prefix: told to upgrade a collector that bun or pnpm put on the machine, npm
 *  installs a second copy somewhere else and exits 0. The service keeps running
 *  the untouched original, so the collector re-runs a "successful" upgrade every
 *  six hours and never moves off its version. */
function updateCommand(script: string, version: string): { cmd: string; args: string[] } {
	const spec = `${PACKAGE}@${version}`
	const root = installRoot(script)
	const manager = root ? MANAGERS.find(m => existsSync(join(root, m.lockfile))) : undefined
	return manager && root
		? { cmd: managerBinary(root, manager.bin), args: [...manager.install, spec] }
		: { cmd: npmCommand(), args: ['install', '--global', spec] }
}

/** An `npm install` that never returns would hang the watch loop forever, since
 *  the update check is awaited inline before the next tick is scheduled: the
 *  daemon would still be "running" while collecting nothing, with an empty log.
 *  Generous enough for a slow registry on a cold cache. */
const RUN_TIMEOUT_MS = 10 * 60_000

/** The environment with our own node on PATH.
 *
 *  Not a nicety: launchd hands a service PATH=/usr/bin:/bin:/usr/sbin:/sbin and
 *  npm is a script starting `#!/usr/bin/env node`, so unless node happens to sit
 *  in /usr/bin — it doesn't for Homebrew, nvm, fnm, volta or asdf — the update
 *  dies with exit 127 on every tick, forever, and the device sits on the version
 *  it was installed at. */
function pathWithNode(): NodeJS.ProcessEnv {
	const env = { ...process.env }
	// Windows enumerates it as `Path`; writing a second `PATH` key would leave the
	// child with two, and which one wins is anyone's guess.
	const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH') ?? 'PATH'
	env[key] = [dirname(process.execPath), env[key]].filter(Boolean).join(delimiter)
	return env
}

/** Exit code of a finished child, or null when it could not be started, was
 *  killed for exceeding RUN_TIMEOUT_MS, or died on a signal. */
function run(cmd: string, args: string[]): Promise<number | null> {
	return new Promise(resolve => {
		// shell on Windows: node refuses to spawn a .cmd directly since the 2024
		// argument-injection fix. Every argument here is a literal or VERSION-checked.
		const child = spawn(cmd, args, { shell: process.platform === 'win32', stdio: 'ignore', env: pathWithNode() })
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
	if (!force && flagOff(process.env.USAGEFLEET_UPDATE, readStore().update)) {
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

	const { cmd, args } = updateCommand(self, latest)
	const manager = basename(cmd).replace(/\.cmd$/, '')
	log('ok', `${RELEASE_VERSION} → ${latest} · installing ${PACKAGE} with ${manager}…`)
	const code = await run(cmd, args)
	if (code !== 0) {
		log(
			'warn',
			code === null
				? `${manager} not available · reinstall with \`${manager} ${args.join(' ')}\``
				: `${manager} install failed (exit ${code}) · if the global prefix needs root, run it yourself`,
		)
		return null
	}

	// A package manager exits 0 for an install it wrote somewhere this collector
	// does not run from, so "success" is not the same as the new version being
	// live. Restarting on that would bounce the service back onto the very same
	// old code, every six hours, forever.
	const onDisk = installedVersion(self)
	if (onDisk && onDisk !== latest) {
		log('warn', `still ${onDisk} at ${tilde(self)} · ${manager} updated a different install · reinstall it there`)
		return null
	}

	// Detached: `login` rewrites the service definition and restarts it, which
	// kills this process tree. The install replaced the file behind `self`, so
	// this is already the new version.
	spawn(process.execPath, [self, 'login'], { detached: true, stdio: 'ignore' }).unref()
	log('ok', `installed ${latest} · restarting service`)
	return latest
}
