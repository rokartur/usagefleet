import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readStore, updateStore } from './store.js'
import type { Store } from './types.js'

// The store is the collector's only persisted file, so two things must hold:
// an existing install's three legacy files survive the consolidation, and a
// writer never clobbers a section it does not own.

// os.homedir() reads $HOME on POSIX and $USERPROFILE on Windows, so pointing the
// legacy lookups at a scratch dir needs no module mocking.
const home = mkdtempSync(join(tmpdir(), 'uf-home-'))
const realEnv = { ...process.env }
beforeAll(() => {
	process.env.HOME = home
	process.env.USERPROFILE = home
	delete process.env.USAGEFLEET_STATE
	delete process.env.USAGEFLEET_NOTIFY_STATE
})

afterAll(() => {
	process.env = realEnv
})

function read(path: string): Store {
	return JSON.parse(readFileSync(path, 'utf-8')) as Store
}

describe('store', () => {
	it('folds the three legacy files into one, keeping token and offsets', () => {
		writeFileSync(
			join(home, '.usagefleet.json'),
			// `endpoint` is a field the store no longer has: old files still carry it,
			// and dropping an unknown key must not take the token with it.
			JSON.stringify({
				endpoint: 'https://a.test',
				projectsDir: '/p',
				token: 'uf_old',
			}),
		)
		writeFileSync(
			join(home, '.usagefleet-state.json'),
			JSON.stringify({
				deviceId: 'dev-1',
				files: { '/a.jsonl': { inode: 7, offset: 42 } },
			}),
		)
		writeFileSync(
			join(home, '.usagefleet-notify.json'),
			JSON.stringify({ fiveHour: { lastBucket: 80, resetsAt: null } }),
		)

		const store = readStore(join(home, 'absent', 'config.json'))

		expect(store.token).toBe('uf_old')
		expect(store.projectsDir).toBe('/p')
		expect(store.state.deviceId).toBe('dev-1')
		expect(store.state.files['/a.jsonl']).toStrictEqual({
			inode: 7,
			offset: 42,
		})
		expect(store.notify.fiveHour.lastBucket).toBe(80)
		// A window absent from the legacy file still comes back whole.
		expect(store.notify.sevenDay).toStrictEqual({
			lastBucket: 0,
			resetsAt: null,
		})
	})

	it('keeps a token written by a concurrent install when saving offsets', () => {
		const path = join(mkdtempSync(join(tmpdir(), 'uf-store-')), 'config.json')
		updateStore(path, s => {
			s.token = 'uf_first'
			s.state.files['/a.jsonl'] = { inode: 1, offset: 10 }
		})

		// Someone ran `usagefleet login` after the service loaded its copy.
		updateStore(path, s => {
			s.token = 'uf_rotated'
		})

		// The service now commits the offsets it has been holding all along.
		updateStore(path, s => {
			s.state.files['/a.jsonl'] = { inode: 1, offset: 99 }
		})

		const saved = read(path)
		expect(saved.token).toBe('uf_rotated')
		expect(saved.state.files['/a.jsonl'].offset).toBe(99)
	})
})
