import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readJcodeSession } from './jcode.js'

const usage = { cache_creation_input_tokens: 30, cache_read_input_tokens: 40, input_tokens: 10, output_tokens: 20 }

describe(readJcodeSession, () => {
	it('reads assistant usage from Claude subscription turns only', () => {
		const dir = mkdtempSync(join(tmpdir(), 'uf-jcode-'))
		const snapshot = join(dir, 'session_owl_1_a.json')
		writeFileSync(
			snapshot,
			JSON.stringify({
				id: 'session_owl_1_a',
				messages: [
					{ id: 'message_1', role: 'user', timestamp: '2026-10-13T10:00:00.000Z' },
					{ id: 'message_2', role: 'assistant', timestamp: '2026-10-13T10:00:01.000Z', token_usage: usage },
				],
				model: 'claude-opus-5-5',
				provider_key: 'claude',
				working_dir: '/work',
			}),
		)
		writeFileSync(
			join(dir, 'session_owl_1_a.journal.jsonl'),
			`${JSON.stringify({
				append_messages: [
					{ id: 'message_3', role: 'assistant', timestamp: '2026-10-13T10:00:02.000Z', token_usage: usage },
				],
				meta: { model: 'claude-opus-5-5', provider_key: 'claude-api', working_dir: '/work' },
			})}\n`,
		)

		expect(readJcodeSession(snapshot, 'jcode')?.records).toStrictEqual([
			{
				cacheCreation1h: null,
				cacheCreation5m: null,
				cacheCreationTokens: 30,
				cacheReadTokens: 40,
				cwd: '/work',
				gitBranch: null,
				inputTokens: 10,
				messageId: 'message_2',
				model: 'claude-opus-5-5',
				outputTokens: 20,
				requestId: null,
				serviceTier: null,
				sessionId: 'session_owl_1_a',
				source: 'jcode',
				timestamp: '2026-10-13T10:00:01.000Z',
				uuid: 'jcode:message_2',
				version: null,
			},
		])
	})
})
