import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claudeCredentialsPath, claudeSettingsPath, claudeStatePath, defaultPiSessionsDirs } from './paths.js'

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

// pi exports its agent dir resolved, so with ~/.pi -> .dotfiles/.pi a run from a pi shell
// scanned every session twice and stored each offset under both paths.
describe(defaultPiSessionsDirs, () => {
	it('lists a sessions dir reached through a symlink once, under the first path', () => {
		const root = mkdtempSync(join(tmpdir(), 'uf-pi-'))
		const real = join(root, 'dotfiles', '.pi')
		mkdirSync(join(real, 'agent', 'sessions'), { recursive: true })
		symlinkSync(real, join(root, '.pi'))
		process.env.PI_CODING_AGENT_SESSION_DIR = join(root, '.pi', 'agent', 'sessions')
		process.env.PI_CODING_AGENT_DIR = join(real, 'agent')

		expect(defaultPiSessionsDirs()).toStrictEqual([
			join(homedir(), '.pi', 'agent', 'sessions'),
			join(root, '.pi', 'agent', 'sessions'),
		])
	})
})
