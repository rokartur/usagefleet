import { describe, expect, it } from 'vitest'
import type { ProjectUsage } from '@/lib/data'
import { splitPath, toRows } from './ProjectTable'

const project = (path: string | null, costUsd: number, group: string, lastActive = '2026-01-01T00:00:00.000Z') =>
	({
		billableTokens: costUsd * 10,
		costUsd,
		groups: [{ color: '#fff', name: group }],
		lastActive,
		path,
		totalTokens: costUsd * 20,
	}) satisfies ProjectUsage

describe(splitPath, () => {
	it('folds the home directory on every OS', () => {
		expect(splitPath('/Users/artur/Developer/adescom/vapp')).toStrictEqual({
			name: 'vapp',
			parent: '~/Developer/adescom',
		})
		expect(splitPath('/home/artur/coding/classics')).toStrictEqual({ name: 'classics', parent: '~/coding' })
		expect(splitPath('C:\\Users\\Mycka\\Documents\\sub24\\sub24')).toStrictEqual({
			name: 'sub24',
			parent: '~\\Documents\\sub24',
		})
	})

	it('keeps the drive on non-home Windows paths', () => {
		expect(splitPath('E:\\New_Love_Religion\\Projects\\APIconsole')).toStrictEqual({
			name: 'APIconsole',
			parent: 'E:\\New_Love_Religion\\Projects',
		})
		expect(splitPath('D:\\repo')).toStrictEqual({ name: 'repo', parent: 'D:' })
	})

	it('buckets logs without a working directory', () => {
		expect(splitPath(null).name).toBe('No project')
	})
})

describe(toRows, () => {
	const projects = [
		project('/Users/artur/Developer/vapp', 30, 'laptops', '2026-01-02T00:00:00.000Z'),
		project('/Users/artur/work/vapp', 12, 'desktops'),
		project('/Users/artur/Developer/usagefleet', 20, 'laptops'),
	]

	it('keeps one row per path when merging is off', () => {
		expect(toRows(projects, false).map(r => r.paths)).toStrictEqual(projects.map(p => [p.path]))
	})

	it('folds same-name folders, sums them and re-sorts by cost', () => {
		const rows = toRows(projects, true)
		expect(rows.map(r => splitPath(r.path).name)).toStrictEqual(['vapp', 'usagefleet'])
		const vapp = rows[0]
		expect(vapp.costUsd).toBe(42)
		expect(vapp.billableTokens).toBe(420)
		expect(vapp.paths).toStrictEqual(['/Users/artur/Developer/vapp', '/Users/artur/work/vapp'])
		expect(vapp.groups.map(g => g.name)).toStrictEqual(['laptops', 'desktops'])
		// The most recent of the folded paths, not the first one seen.
		expect(vapp.lastActive).toBe('2026-01-02T00:00:00.000Z')
	})

	it('leaves the source rows untouched', () => {
		toRows(projects, true)
		expect(projects[0]).toStrictEqual(
			project('/Users/artur/Developer/vapp', 30, 'laptops', '2026-01-02T00:00:00.000Z'),
		)
	})
})
