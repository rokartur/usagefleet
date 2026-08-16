import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { writeFileAtomic } from './atomic-write.js'
import type { Store, WindowNotifyState } from './types.js'

/**
 * The collector's one file: settings, tail offsets and notification marks all
 * live in `~/.config/usagefleet/config.json` (XDG_CONFIG_HOME honoured, and
 * USAGEFLEET_CONFIG overrides the whole path). One file means one thing to
 * back up, inspect, delete or bake into a service unit.
 */
export function storePath(): string {
	const override = process.env.USAGEFLEET_CONFIG
	if (override) {
		return override
	}
	const xdg = process.env.XDG_CONFIG_HOME
	return join(xdg && xdg.length > 0 ? xdg : join(homedir(), '.config'), 'usagefleet', 'config.json')
}

/** Where the three pre-consolidation files lived, honouring the env overrides
 *  that used to point at them so a customised install still migrates. */
function legacyPaths(): { settings: string; state: string; notify: string } {
	return {
		notify: process.env.USAGEFLEET_NOTIFY_STATE ?? join(homedir(), '.usagefleet-notify.json'),
		settings: join(homedir(), '.usagefleet.json'),
		state: process.env.USAGEFLEET_STATE ?? join(homedir(), '.usagefleet-state.json'),
	}
}

function readJson<T>(path: string): T | null {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return null
		}
		return parsed as T
	} catch {
		return null // missing or corrupt → caller falls back to defaults
	}
}

export function freshWindow(): WindowNotifyState {
	return { lastBucket: 0, resetsAt: null }
}

/** Fill in every field so callers get a total value, whatever the file held. */
function normalize(raw: Partial<Store>): Store {
	return {
		desktopDir: raw.desktopDir,
		limits: raw.limits,
		notify: {
			fiveHour: { ...freshWindow(), ...raw.notify?.fiveHour },
			sevenDay: { ...freshWindow(), ...raw.notify?.sevenDay },
		},
		piDir: raw.piDir,
		projectsDir: raw.projectsDir,
		state: {
			deviceId: raw.state?.deviceId || randomUUID(),
			files: raw.state?.files ?? {},
			updatedAt: raw.state?.updatedAt ?? new Date().toISOString(),
		},
		token: raw.token,
		version: 1,
	}
}

/**
 * Read the store, folding in the three legacy files when the consolidated one
 * does not exist yet. Nothing is written here — the first `updateStore` commits
 * the merged result — so a read-only command never rewrites the user's disk.
 * The old files are left in place; an upgraded collector simply stops reading
 * them, and a rollback still finds them intact.
 */
export function readStore(path: string = storePath()): Store {
	const direct = readJson<Partial<Store>>(path)
	if (direct) {
		return normalize(direct)
	}

	const legacy = legacyPaths()
	const settings = readJson<Partial<Store>>(legacy.settings) ?? {}
	const state = readJson<Store['state']>(legacy.state)
	const notify = readJson<Store['notify']>(legacy.notify)
	return normalize({
		...settings,
		notify: notify ?? undefined,
		state: state ?? undefined,
	})
}

/**
 * Read-modify-write the store atomically. Re-reading inside the call is what
 * lets `usagefleet login` change the token while the service is mid-cycle: the
 * service's next save picks up the new token instead of overwriting it with the
 * copy it loaded minutes ago.
 *
 * ponytail: read-then-write is not a lock, so two writers landing in the same
 * few milliseconds can still lose one update. Take a lockfile if the collector
 * ever grows a second concurrent writer; today it is one service plus the
 * occasional human command.
 */
export function updateStore(path: string, mutate: (store: Store) => void): void {
	const store = readStore(path)
	mutate(store)
	mkdirSync(dirname(path), { recursive: true })
	// 0600: the file holds the device token.
	writeFileAtomic(path, `${JSON.stringify(store, null, 2)}\n`, 0o600)
}
