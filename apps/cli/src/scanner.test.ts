import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listJsonlFiles } from './scanner.js'
import type { DirCache } from './scanner.js'

const HOUR_AGO = new Date(Date.now() - 3_600_000)

function sessionsRoot(): { root: string; project: string } {
	const root = mkdtempSync(join(tmpdir(), 'uf-scan-'))
	const project = join(root, 'project')
	mkdirSync(project)
	writeFileSync(join(project, 'a.jsonl'), '')
	return { project, root }
}

// The tests pin a folder's mtime with utimesSync to show which listing a scan used.
describe(listJsonlFiles, () => {
	it('re-reads a folder only when its mtime moved', () => {
		const { project, root } = sessionsRoot()
		utimesSync(project, HOUR_AGO, HOUR_AGO)
		const cache: DirCache = new Map()
		listJsonlFiles(root, cache)

		writeFileSync(join(project, 'b.jsonl'), '')
		utimesSync(project, HOUR_AGO, HOUR_AGO)
		expect(listJsonlFiles(root, cache)).toStrictEqual([join(project, 'a.jsonl')])

		const now = new Date()
		utimesSync(project, now, now)
		expect(listJsonlFiles(root, cache).toSorted()).toStrictEqual([
			join(project, 'a.jsonl'),
			join(project, 'b.jsonl'),
		])
	})

	// Linux stamps mtimes with a jiffy-coarse clock, HFS+ by the second: a second change
	// right after the read can carry the same mtime as the listing.
	it('does not trust a listing read while the folder was still changing', () => {
		const { project, root } = sessionsRoot()
		const tick = new Date()
		utimesSync(project, tick, tick)
		const cache: DirCache = new Map()
		listJsonlFiles(root, cache)

		writeFileSync(join(project, 'b.jsonl'), '')
		utimesSync(project, tick, tick)
		expect(listJsonlFiles(root, cache)).toHaveLength(2)
	})

	it('forgets folders that are gone', () => {
		const { project, root } = sessionsRoot()
		mkdirSync(join(project, 'subagent'))
		const cache: DirCache = new Map()
		listJsonlFiles(root, cache)

		rmSync(project, { recursive: true })
		expect(listJsonlFiles(root, cache)).toStrictEqual([])
		expect([...cache.keys()]).toStrictEqual([root])
	})
})
