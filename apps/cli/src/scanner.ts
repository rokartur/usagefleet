import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** A folder's entries as of `mtimeMs`, or null when it was read while still changing. */
interface Listing {
	mtimeMs: number | null
	files: string[]
	dirs: string[]
}

/** Listings `watch` keeps between cycles, keyed by folder path. */
export type DirCache = Map<string, Listing>

// Linux stamps mtimes with a jiffy-coarse clock, HFS+ by the second, FAT by two: a change
// right after a read can carry the listing's mtime. Only a folder quiet this long is trusted.
const QUIET_MS = 10_000

/** Recursively list all *.jsonl files under a directory. Returns [] if the
 *  directory is missing. A folder whose mtime has not moved reuses its listing
 *  from `cache`: adding or removing an entry moves it, appending to a log does not. */
export function listJsonlFiles(dir: string, cache: DirCache = new Map()): string[] {
	const listing = listDir(dir, cache)
	const out = [...listing.files]
	for (const sub of listing.dirs) {
		out.push(...listJsonlFiles(sub, cache))
	}
	return out
}

function listDir(dir: string, cache: DirCache): Listing {
	const cached = cache.get(dir)
	const readAt = Date.now()
	let mtimeMs
	let entries
	try {
		mtimeMs = statSync(dir).mtimeMs
		if (cached?.mtimeMs === mtimeMs) {
			return cached
		}
		entries = readdirSync(dir, { withFileTypes: true })
	} catch {
		forget(cache, dir)
		return { dirs: [], files: [], mtimeMs: null }
	}
	const listing: Listing = { dirs: [], files: [], mtimeMs: readAt - mtimeMs > QUIET_MS ? mtimeMs : null }
	for (const e of entries) {
		const full = join(dir, e.name)
		if (e.isDirectory()) {
			listing.dirs.push(full)
		} else if (e.isFile() && e.name.endsWith('.jsonl')) {
			listing.files.push(full)
		}
	}
	const kept = new Set(listing.dirs)
	for (const sub of cached?.dirs ?? []) {
		if (!kept.has(sub)) {
			forget(cache, sub)
		}
	}
	cache.set(dir, listing)
	return listing
}

function forget(cache: DirCache, dir: string): void {
	const listing = cache.get(dir)
	cache.delete(dir)
	for (const sub of listing?.dirs ?? []) {
		forget(cache, sub)
	}
}
