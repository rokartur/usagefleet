import { defaultDesktopSessionsDir, defaultPiSessionsDirs, defaultProjectsDir } from './paths.js'
import { readStore, storePath } from './store.js'
import type { Config } from './types.js'

/** Matches the server's BatchSchema `.max(1000)`. */
const MAX_BATCH = 1000

/** The only server a collector talks to. Not configurable: the request carries
 *  a device token and a log of what this machine is working on, so there is one
 *  https destination and no way to redirect it. */
export const ENDPOINT = 'https://usagefleet.com'

/** Resolve config from env first, then the stored settings (see store.ts). */
export function loadConfig(): Config {
	const file = readStore()
	// Use `||` (not `??`) so an empty-string env var falls back to the config
	// file — launchd/systemd units may inject empty USAGEFLEET_* values.
	const token = process.env.USAGEFLEET_TOKEN || file.token || ''
	if (!token) {
		throw new Error('USAGEFLEET_TOKEN is not set')
	}
	// Guard batch size: "0" (infinite loop), NaN (silent drop), fractional → 100.
	// Clamped to the server's own 1000-record cap, since a larger batch is
	// rejected as malformed and would cost the whole chunk a bisect to discover.
	const parsedBatch = Math.floor(positiveNumber(process.env.USAGEFLEET_BATCH, file.batch) ?? 100)
	const batchSize = Number.isFinite(parsedBatch) && parsedBatch > 0 ? Math.min(parsedBatch, MAX_BATCH) : 100
	return {
		batchSize,
		desktopDir: resolveOptionalDir(process.env.USAGEFLEET_DESKTOP, file.desktopDir, defaultDesktopSessionsDir()),
		piDirs: resolvePiDirs(process.env.USAGEFLEET_PI, file.piDir),
		projectsDir: process.env.USAGEFLEET_PROJECTS || file.projectsDir || defaultProjectsDir(),
		storePath: storePath(),
		token,
	}
}

/** env → file → nothing, for the numeric knobs (intervals, batch): an env
 *  value wins when present (empty string counts as unset, same `||` rule as
 *  loadConfig), and a non-positive or non-numeric candidate is skipped rather
 *  than trusted. */
export function positiveNumber(env?: string, fromFile?: number): number | null {
	for (const candidate of [env ? Number(env) : null, fromFile]) {
		if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
			return candidate
		}
	}
	return null
}

/** The off-switches (hook, update, notifications): an env value wins when
 *  present — 0/false/off/no disable, anything else enables — otherwise `false`
 *  under the config-file key disables. */
export function flagOff(env?: string, fromFile?: boolean): boolean {
	if (env) {
		return /^(0|false|off|no)$/i.test(env.trim())
	}
	return fromFile === false
}

/** pi scan roots: env "off"/"0" disables, else a comma-separated env list, else
 *  the config file's string-or-array, else every auto-detected default. */
export function resolvePiDirs(env?: string, fromFile?: string | string[]): string[] {
	if (env === '0' || env?.toLowerCase() === 'off') {
		return []
	}
	const raw = env ? env.split(',') : Array.isArray(fromFile) ? fromFile : fromFile ? [fromFile] : null
	if (!raw) {
		return defaultPiSessionsDirs()
	}
	return [...new Set(raw.map(d => d.trim()).filter(d => d.length > 0))]
}

/** Optional scan root (USAGEFLEET_DESKTOP): env "off"/"0" disables, env or
 *  config-file path overrides, else the auto-detected default. */
function resolveOptionalDir(env: string | undefined, fromFile: string | undefined, fallback: string): string | null {
	if (env === '0' || env?.toLowerCase() === 'off') {
		return null
	}
	return env || fromFile || fallback
}
