import { appendFileSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
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
		expect(tailFile(fp, undefined, 'pi')?.segments[0]?.records[0]?.cwd).toBe('/Users/artur/Developer/usagefleet')
	})

	it('still finds the cwd when the tail resumes past the header', () => {
		const fp = piFile([header, message])
		const offset = Buffer.byteLength(`${header}\n`)
		const tail = tailFile(fp, { inode: Number(statSync(fp).ino), offset }, 'pi')
		expect(tail?.segments[0]?.records[0]?.cwd).toBe('/Users/artur/Developer/usagefleet')
	})

	it('parses each usage line once and leaves a partial trailing line for the next cycle', () => {
		const twoUsageKeys = JSON.stringify({ ...JSON.parse(message), usage: 'not the message one' })
		const rejected = JSON.stringify({ message: { role: 'user' }, type: 'message', usage: {} })
		const fp = piFile([header, rejected, message, 'not json', twoUsageKeys])
		const complete = statSync(fp).size
		appendFileSync(fp, message.slice(0, 40))
		const tail = tailFile(fp, undefined, 'pi')
		expect(tail?.segments[0]?.records).toHaveLength(2)
		expect(tail?.consumedBytes).toBe(complete)
	})

	it('leaves cwd null when the header has none', () => {
		const fp = piFile([JSON.stringify({ id: 'x', type: 'session' }), message])
		expect(tailFile(fp, undefined, 'pi')?.segments[0]?.records[0]?.cwd).toBeNull()
	})

	it('books each agent request on the Claude account that served it, skipping API keys', () => {
		const usage = (fields: object) =>
			JSON.stringify({
				cache_read: 9,
				cache_write: 2,
				input: 3,
				output: 4,
				timestamp: 1_792_102_157_067,
				type: 'usage',
				...fields,
			})
		const fp = piFile([
			JSON.stringify({ cwd: '/repo', id: 'ea1b0a3e', type: 'session' }),
			usage({ account: 'acc-a', id: 'msg_1', provider: 'anthropic' }),
			usage({ account: null, id: 'msg_2', provider: 'anthropic' }),
			usage({ account: 'chatgpt-1', id: 'resp_3', provider: 'openai-codex' }),
			usage({ model: 'claude-opus-5-5' }),
			usage({ account: 'acc-b', id: 'msg_4', provider: 'anthropic' }),
		])
		const segments = tailFile(fp, undefined, 'agent')?.segments
		expect(segments?.map(s => [s.accountExtId, s.records.map(r => r.uuid)])).toStrictEqual([
			['acc-a', ['agent:msg_1']],
			['acc-b', ['agent:msg_4']],
		])
		expect(segments?.[0]?.records[0]).toMatchObject({
			cacheReadTokens: 9,
			cwd: '/repo',
			timestamp: '2026-10-15T22:09:17.067Z',
		})
	})
})
