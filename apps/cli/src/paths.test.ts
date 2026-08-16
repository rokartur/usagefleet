import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claudeCredentialsPath, claudeSettingsPath, claudeStatePath } from './paths.js'

const realEnv = { ...process.env }
afterEach(() => {
	process.env = { ...realEnv }
})

// A relocated config dir is a second Claude login on the same machine: every
// per-login file has to follow it, or the collector reports one account's
// limits under the other's identity.
describe('claude config dir', () => {
	it('follows CLAUDE_CONFIG_DIR', () => {
		process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-work'
		expect(claudeSettingsPath()).toBe('/tmp/claude-work/settings.json')
		expect(claudeCredentialsPath()).toBe('/tmp/claude-work/.credentials.json')
		expect(claudeStatePath()).toBe('/tmp/claude-work/.claude.json')
	})

	it('defaults to ~/.claude, with the state file beside it', () => {
		delete process.env.CLAUDE_CONFIG_DIR
		expect(claudeSettingsPath()).toBe(join(homedir(), '.claude', 'settings.json'))
		expect(claudeCredentialsPath()).toBe(join(homedir(), '.claude', '.credentials.json'))
		expect(claudeStatePath()).toBe(join(homedir(), '.claude.json'))
	})
})
