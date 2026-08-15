import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commands, installCompletions, removeCompletions } from './completion.js'

// The module resolves homedir() per call, so pointing it at a temp dir is enough
// to keep every write inside the sandbox.
let home: string
beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'uf-completion-'))
	vi.mocked(homedir).mockReturnValue(home)
	// Both shells "in use", so one install exercises the fish and zsh paths.
	writeFileSync(join(home, '.zshrc'), 'export EDITOR=vim\nautoload -Uz compinit && compinit\n')
	process.env.SHELL = '/bin/zsh:fish'
})
afterEach(() => {
	vi.restoreAllMocks()
})

vi.mock(import('node:os'), async importOriginal => ({
	...(await importOriginal()),
	homedir: vi.fn(),
}))

const rc = () => readFileSync(join(home, '.zshrc'), 'utf-8')

describe(installCompletions, () => {
	it('writes each shell script where that shell looks', () => {
		const done = installCompletions()
		expect(done.map(d => d.shell).toSorted()).toStrictEqual(['fish', 'zsh'])
		expect(readFileSync(join(home, '.zsh', 'completions', '_usagefleet'), 'utf-8')).toContain('#compdef usagefleet')
		expect(readFileSync(join(home, '.config', 'fish', 'completions', 'usagefleet.fish'), 'utf-8')).toContain(
			'complete -c usagefleet',
		)
	})

	it('puts the fpath block after the user\u2019s own compinit, or zsh never sees it', () => {
		installCompletions()
		expect(rc().indexOf('fpath=')).toBeGreaterThan(rc().indexOf('autoload -Uz compinit && compinit\n'))
	})

	it('adds the rc block once, however many times install runs', () => {
		expect(installCompletions().find(d => d.shell === 'zsh')?.rc).toBe(join(home, '.zshrc'))
		const after = rc()
		// Self-update re-runs `install`, so a second pass must not stack blocks.
		expect(installCompletions().find(d => d.shell === 'zsh')?.rc).toBeUndefined()
		expect(rc()).toBe(after)
	})

	it('leaves a shell alone when it is neither the login shell nor configured', () => {
		process.env.SHELL = '/bin/bash'
		vi.mocked(homedir).mockReturnValue(mkdtempSync(join(tmpdir(), 'uf-bare-')))
		expect(installCompletions()).toStrictEqual([])
	})
})

describe(removeCompletions, () => {
	it('strips its own block and nothing the user wrote', () => {
		installCompletions()
		removeCompletions()
		expect(rc()).toBe('export EDITOR=vim\nautoload -Uz compinit && compinit\n')
	})

	it('is safe to run when install never did', () => {
		expect(() => removeCompletions()).not.toThrow()
		expect(rc()).toBe('export EDITOR=vim\nautoload -Uz compinit && compinit\n')
	})
})

describe('the advertised command list', () => {
	it('hides the entrypoints that are not for typing', () => {
		// `watch` is what the installed service runs and `version` duplicates the
		// header; neither should reach help or the completion scripts.
		const names = commands.map(c => c.name)
		expect(names).not.toContain('watch')
		expect(names).not.toContain('version')
	})
})
