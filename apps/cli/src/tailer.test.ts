import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tailFile } from './tailer.js'

// pi's message lines carry no cwd, so every pi record would land in the
// dashboard's "No project" bucket unless the session header is read.
const header = JSON.stringify({
	cwd: '/Users/artur/Developer/usagefleet',
	id: '01a006ff',
	timestamp: '2026-07-19T14:03:00.000Z',
	type: 'session',
})
const message = JSON.stringify({
	id: 'abcd1234',
	message: {
		model: 'claude-opus-5',
		provider: 'anthropic',
		responseId: 'msg_pi_abc123',
		role: 'assistant',
		usage: { cacheRead: 12_800, cacheWrite: 50, input: 2332, output: 781 },
	},
	timestamp: '2026-07-19T14:03:18.826Z',
	type: 'message',
})

function piFile(lines: string[]): string {
	const fp = join(mkdtempSync(join(tmpdir(), 'uf-tail-')), 'session.jsonl')
	writeFileSync(fp, `${lines.join('\n')}\n`)
	return fp
}

describe(tailFile, () => {
	it('fills pi records with the session header cwd', () => {
		const fp = piFile([header, message])
		expect(tailFile(fp, undefined, 'pi')?.records[0]?.cwd).toBe('/Users/artur/Developer/usagefleet')
	})

	it('still finds the cwd when the tail resumes past the header', () => {
		const fp = piFile([header, message])
		const offset = Buffer.byteLength(`${header}\n`)
		const tail = tailFile(fp, { inode: Number(statSync(fp).ino), offset }, 'pi')
		expect(tail?.records[0]?.cwd).toBe('/Users/artur/Developer/usagefleet')
	})

	it('leaves cwd null when the header has none', () => {
		const fp = piFile([JSON.stringify({ id: 'x', type: 'session' }), message])
		expect(tailFile(fp, undefined, 'pi')?.records[0]?.cwd).toBeNull()
	})
})
