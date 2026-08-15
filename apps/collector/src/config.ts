import { defaultDesktopSessionsDir, defaultPiSessionsDirs, defaultProjectsDir } from './paths.js'
import { readStore, storePath } from './store.js'
import type { Config } from './types.js'

/** Matches the server's BatchSchema `.max(1000)`. */
const MAX_BATCH = 1000
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** Resolve config from env first, then the stored settings (see store.ts). */
export function loadConfig(): Config {
	const file = readStore()
	// Use `||` (not `??`) so an empty-string env var falls back to the config
	// file — launchd/systemd units may inject empty USAGEFLEET_* values.
	const endpoint = (process.env.USAGEFLEET_ENDPOINT || file.endpoint || '').replace(/\/+$/, '')
	const token = process.env.USAGEFLEET_TOKEN || file.token || ''
	if (!endpoint) {
		throw new Error('USAGEFLEET_ENDPOINT is not set')
	}
	if (!token) {
		throw new Error('USAGEFLEET_TOKEN is not set')
	}
	if (!isSecureEndpoint(endpoint)) {
		throw new Error(
			`USAGEFLEET_ENDPOINT must be https (got ${endpoint}). It carries the device token on every request and self-update executes a binary fetched from it.`,
		)
	}
	// Guard batch size: "0" (infinite loop), NaN (silent drop), fractional → 100.
	// Clamped to the server's own 1000-record cap, since a larger batch is
	// rejected as malformed and would cost the whole chunk a bisect to discover.
	const parsedBatch = Math.floor(Number(process.env.USAGEFLEET_BATCH))
	const batchSize = Number.isFinite(parsedBatch) && parsedBatch > 0 ? Math.min(parsedBatch, MAX_BATCH) : 100
	return {
		batchSize,
		desktopDir: resolveOptionalDir(process.env.USAGEFLEET_DESKTOP, file.desktopDir, defaultDesktopSessionsDir()),
		endpoint,
		piDirs: resolvePiDirs(process.env.USAGEFLEET_PI, file.piDir),
		projectsDir: process.env.USAGEFLEET_PROJECTS || file.projectsDir || defaultProjectsDir(),
		storePath: storePath(),
		token,
	}
}

/** pi scan roots: env "off"/"0" disables, else a comma-separated env list, else
 *  the config file's string-or-array, else every auto-detected default. */
export function resolvePiDirs(env: string | undefined, fromFile: string | string[] | undefined): string[] {
	if (env === '0' || env?.toLowerCase() === 'off') {
		return []
	}
	const raw = env ? env.split(',') : Array.isArray(fromFile) ? fromFile : fromFile ? [fromFile] : null
	if (!raw) {
		return defaultPiSessionsDirs()
	}
	return [...new Set(raw.map(d => d.trim()).filter(d => d.length > 0))]
}

/** Optional scan root (USAGEFLEET_DESKTOP / USAGEFLEET_PI): env "off"/"0"
 *  disables, env or config-file path overrides, else the auto-detected default. */
function resolveOptionalDir(env: string | undefined, fromFile: string | undefined, fallback: string): string | null {
	if (env === '0' || env?.toLowerCase() === 'off') {
		return null
	}
	return env || fromFile || fallback
}

/**
 * The endpoint must be https: it carries the device token on every request, and
 * `checkForUpdate` downloads an executable from it, chmods it 0755 and swaps it
 * into the service's launch path. Plaintext there is remote code execution.
 * Loopback is exempt so local development keeps working.
 */
export function isSecureEndpoint(endpoint: string): boolean {
	let url: URL
	try {
		url = new URL(endpoint)
	} catch {
		return false
	}
	if (url.protocol === 'https:') {
		return true
	}
	return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}
