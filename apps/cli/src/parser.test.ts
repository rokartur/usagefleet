import { describe, expect, it } from 'vitest'
import { parseLine } from './parser.js'

const assistantLine = JSON.stringify({
	cwd: '/Users/artur/Developer/x',
	gitBranch: 'main',
	message: {
		id: 'msg_01PZCT45Lm8WPvW1yJnNxf5S',
		model: 'claude-opus-4-7',
		role: 'assistant',
		usage: {
			cache_creation_input_tokens: 9252,
			cache_read_input_tokens: 16_713,
			input_tokens: 6671,
			output_tokens: 117,
			service_tier: 'standard',
		},
	},
	requestId: 'req_abc',
	sessionId: 'a21df212-b688-44e5-acb5-a91e1291dcb7',
	timestamp: '2026-06-12T01:15:29.820Z',
	type: 'assistant',
	uuid: '5e0afa98-7e74-4019-95da-cd8f3dd2709b',
	version: '2.1.170',
})

describe(parseLine, () => {
	it('extracts a usage record from an assistant line', () => {
		const r = parseLine(assistantLine)!
		expect(r.uuid).toBe('5e0afa98-7e74-4019-95da-cd8f3dd2709b')
		expect(r.messageId).toBe('msg_01PZCT45Lm8WPvW1yJnNxf5S')
		expect(r.requestId).toBe('req_abc')
		expect(r.model).toBe('claude-opus-4-7')
		expect(r.inputTokens).toBe(6671)
		expect(r.outputTokens).toBe(117)
		expect(r.cacheCreationTokens).toBe(9252)
		expect(r.cacheReadTokens).toBe(16_713)
		expect(r.source).toBe('cli')
	})

	it('tags the record with the given source (default cli)', () => {
		expect(parseLine(assistantLine, 'desktop')!.source).toBe('desktop')
		expect(parseLine(assistantLine)!.source).toBe('cli')
	})

	it('falls back to nested cache_creation when the flat field is absent', () => {
		const line = JSON.stringify({
			message: {
				id: 'm2',
				model: 'claude-sonnet-4-6',
				usage: {
					cache_creation: {
						ephemeral_1h_input_tokens: 200,
						ephemeral_5m_input_tokens: 100,
					},
					output_tokens: 10,
				},
			},
			type: 'assistant',
			uuid: 'u2',
		})
		const r = parseLine(line)!
		expect(r.cacheCreationTokens).toBe(300)
		// The per-TTL split rides along — 5m and 1h writes price differently.
		expect(r.cacheCreation5m).toBe(100)
		expect(r.cacheCreation1h).toBe(200)
	})

	it('leaves the TTL breakdown null when the log predates it', () => {
		const r = parseLine(assistantLine)!
		expect(r.cacheCreation5m).toBeNull()
		expect(r.cacheCreation1h).toBeNull()
	})

	it('parses pi agent lines, keeping only anthropic-provider usage', () => {
		const piLine = (provider: string) =>
			JSON.stringify({
				id: '0f442440',
				message: {
					api: 'anthropic-messages',
					model: 'claude-opus-5',
					provider,
					responseId: 'msg_pi_abc123',
					role: 'assistant',
					usage: { cacheRead: 12_800, cacheWrite: 50, input: 2332, output: 781 },
				},
				timestamp: '2026-07-19T14:03:18.826Z',
				type: 'message',
			})
		const r = parseLine(piLine('anthropic'), 'pi')!
		expect(r.uuid).toBe('pi:msg_pi_abc123')
		expect(r.messageId).toBe('msg_pi_abc123')
		expect(r.model).toBe('claude-opus-5')
		expect(r.inputTokens).toBe(2332)
		expect(r.outputTokens).toBe(781)
		expect(r.cacheCreationTokens).toBe(50)
		expect(r.cacheReadTokens).toBe(12_800)
		expect(r.source).toBe('pi')
		// other providers don't touch the Claude account
		expect(parseLine(piLine('openai-codex'), 'pi')).toBeNull()
		// a Claude Code line read with source "pi" must not parse (wrong schema)
		expect(parseLine(assistantLine, 'pi')).toBeNull()
	})

	it('falls back to id+timestamp for the pi uuid when responseId is missing', () => {
		const line = JSON.stringify({
			id: 'abcd1234',
			message: {
				provider: 'anthropic',
				role: 'assistant',
				usage: { input: 1 },
			},
			timestamp: '2026-07-19T14:03:18.826Z',
			type: 'message',
		})
		expect(parseLine(line, 'pi')!.uuid).toBe('pi:abcd1234:2026-07-19T14:03:18.826Z')
	})

	it('ignores non-assistant and usage-less lines', () => {
		expect(parseLine(JSON.stringify({ type: 'user', uuid: 'x' }))).toBeNull()
		expect(parseLine(JSON.stringify({ message: { id: 'm' }, type: 'assistant', uuid: 'y' }))).toBeNull()
		expect(parseLine('not json')).toBeNull()
		expect(parseLine('')).toBeNull()
	})

	// All VALID JSON, so the try/catch around JSON.parse does not stop them. Only
	// "null" ever threw — property access on null is a TypeError, while `(123).type`
	// and `[].type` are merely undefined — and that throw escapes tailFile, leaving
	// the file's offset unadvanced so the collector re-reads and re-throws on that
	// file every cycle, silently losing every later record in it. The rest are here
	// to pin the guard's shape, not because they crashed.
	it('returns null for JSON that parses to a non-object', () => {
		for (const line of ['null', '123', '"a string"', 'true', '[]', '[1,2]']) {
			expect(() => parseLine(line)).not.toThrow()
			expect(parseLine(line)).toBeNull()
			expect(() => parseLine(line, 'pi')).not.toThrow()
			expect(parseLine(line, 'pi')).toBeNull()
		}
	})
})
