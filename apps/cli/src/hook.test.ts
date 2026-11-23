import { describe, expect, it } from 'vitest'
import { guardHook, withGuardHook, withoutGuardHook } from './hook.js'

const NODE = 'C:\\Program Files\\nodejs\\node.exe'
const SCRIPT = 'C:\\Users\\k\\AppData\\Roaming\\npm\\node_modules\\@usagefleet\\cli\\dist\\index.js'
const CMD = guardHook([NODE, SCRIPT, 'guard'])

describe(guardHook, () => {
	// No shell parses it, so a path with spaces and backslashes needs no quoting.
	it('splits the program into an exec-form command and args', () => {
		expect(guardHook([NODE, '--max-semi-space-size=1', SCRIPT, 'guard'])).toStrictEqual({
			args: ['--max-semi-space-size=1', SCRIPT, 'guard'],
			command: NODE,
			timeout: 10,
			type: 'command',
		})
	})

	it('passes USAGEFLEET_CONFIG as --config so a second account blocks against itself', () => {
		expect(guardHook(['/opt/usagefleet', 'guard'], '/home/x/my configs/work.json').args).toStrictEqual([
			'guard',
			'--config',
			'/home/x/my configs/work.json',
		])
	})

	it('matches the uninstall pattern with a config', () => {
		const settings = withGuardHook({}, guardHook([NODE, SCRIPT, 'guard'], 'C:\\Users\\k\\work.json'))
		expect(withoutGuardHook(settings).hooks?.UserPromptSubmit ?? []).toStrictEqual([])
	})

	it('replaces the shell-form hook older releases wrote', () => {
		const legacy = withGuardHook(
			{},
			{ command: `set "USAGEFLEET_CONFIG=C:\\w.json" && "${NODE}" "${SCRIPT}" guard` },
		)
		expect(withGuardHook(legacy, CMD).hooks?.UserPromptSubmit).toStrictEqual([{ hooks: [CMD] }])
	})
})

describe(withGuardHook, () => {
	it('is idempotent — re-installing does not stack a second hook', () => {
		const once = withGuardHook({}, CMD)
		expect(withGuardHook(once, CMD)).toStrictEqual(once)
		expect(once.hooks?.UserPromptSubmit).toHaveLength(1)
	})

	it('replaces a guard hook left by an older install at a different path', () => {
		const stale = withGuardHook({}, guardHook(['/old/path/usagefleet', 'guard']))
		const fresh = withGuardHook(stale, CMD)
		expect(fresh.hooks?.UserPromptSubmit).toHaveLength(1)
		expect(fresh.hooks?.UserPromptSubmit[0].hooks?.[0]).toStrictEqual(CMD)
	})

	// The whole file belongs to the user; we only ever add one entry to it.
	it('preserves unrelated settings and unrelated hooks', () => {
		const before = {
			hooks: {
				PreToolUse: [
					{
						hooks: [{ type: 'command', command: 'audit.sh' }],
						matcher: 'Bash',
					},
				],
				UserPromptSubmit: [{ hooks: [{ command: 'spellcheck.sh', type: 'command' }] }],
			},
			model: 'opus',
			permissions: { allow: ['Bash(ls:*)'] },
		}
		const after = withGuardHook(before, CMD)
		expect(after.model).toBe('opus')
		expect(after.permissions).toStrictEqual(before.permissions)
		expect(after.hooks?.PreToolUse).toStrictEqual(before.hooks.PreToolUse)
		expect(after.hooks?.UserPromptSubmit.map(g => g.hooks?.[0].command)).toStrictEqual(['spellcheck.sh', NODE])
	})

	it('drops disableAllHooks, which would switch the guard off around it', () => {
		const after = withGuardHook({ disableAllHooks: true, model: 'opus' }, CMD)
		expect(after).not.toHaveProperty('disableAllHooks')
		expect(after.model).toBe('opus')
	})
})

describe(withoutGuardHook, () => {
	it('removes ours and nothing else', () => {
		const before = {
			hooks: {
				PreToolUse: [{ hooks: [{ command: 'audit.sh', type: 'command' }] }],
				UserPromptSubmit: [{ hooks: [{ command: 'spellcheck.sh', type: 'command' }] }],
			},
		}
		expect(withoutGuardHook(withGuardHook(before, CMD))).toStrictEqual(before)
	})

	it('drops the hooks key entirely when the guard was all there was', () => {
		expect(JSON.stringify(withoutGuardHook(withGuardHook({ model: 'opus' }, CMD)))).toBe('{"model":"opus"}')
	})

	it('is a no-op on settings that never had the hook', () => {
		const before = { model: 'opus' }
		expect(withoutGuardHook(before)).toStrictEqual(before)
	})
})
