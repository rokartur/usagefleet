import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Recursively list all *.jsonl files under a directory. Returns [] if the
 *  directory is missing. */
export function listJsonlFiles(dir: string): string[] {
	const out: string[] = []
	let entries
	try {
		entries = readdirSync(dir, { withFileTypes: true })
	} catch {
		return out
	}
	for (const e of entries) {
		const full = join(dir, e.name)
		if (e.isDirectory()) {
			out.push(...listJsonlFiles(full))
		} else if (e.isFile() && e.name.endsWith('.jsonl')) {
			out.push(full)
		}
	}
	return out
}
