import { describe, expect, it } from 'vitest'
import { guardCommand, withGuardHook, withoutGuardHook } from './hook.js'

const CMD = '"/Users/x/Library/Application Support/usagefleet/usagefleet" guard'

describe(guardCommand, () => {
	it('quotes only the arguments that need it', () => {
		expect(guardCommand(['/Users/x/Library/Application Support/usagefleet/usagefleet', 'guard'])).toBe(
			'"/Users/x/Library/Application Support/usagefleet/usagefleet" guard',
		)
		expect(guardCommand(['/usr/bin/node', '/opt/usagefleet/index.js', 'guard'])).toBe(
			'/usr/bin/node /opt/usagefleet/index.js guard',
		)
	})

	it('carries USAGEFLEET_CONFIG so a second account blocks against itself', () => {
		expect(guardCommand(['/opt/usagefleet', 'guard'], '/home/x/.config/usagefleet/work.json', 'linux')).toBe(
			'USAGEFLEET_CONFIG=/home/x/.config/usagefleet/work.json /opt/usagefleet guard',
		)
		expect(guardCommand(['/opt/usagefleet', 'guard'], '/home/x/my configs/work.json', 'linux')).toBe(
			'USAGEFLEET_CONFIG="/home/x/my configs/work.json" /opt/usagefleet guard',
		)
	})

	it('uses cmd.exe syntax on Windows, which has no inline VAR=value form', () => {
		expect(guardCommand(['C:\\usagefleet.exe', 'guard'], 'C:\\Users\\x\\work.json', 'win32')).toBe(
			'set "USAGEFLEET_CONFIG=C:\\Users\\x\\work.json" && C:\\usagefleet.exe guard',
		)
		// No config: no prefix on either platform, so the plain command is unchanged.
		expect(guardCommand(['C:\\usagefleet.exe', 'guard'], undefined, 'win32')).toBe('C:\\usagefleet.exe guard')
	})

	it('still matches the uninstall pattern once prefixed, on both shells', () => {
		for (const platform of ['linux', 'win32']) {
			const prefixed = guardCommand(
				['/opt/usagefleet', 'guard'],
				'/home/x/.config/usagefleet/work.json',
				platform,
			)
			const settings = withGuardHook({}, prefixed)
			expect(withoutGuardHook(settings).hooks?.UserPromptSubmit ?? []).toStrictEqual([])
		}
	})
})

describe(withGuardHook, () => {
	it('is idempotent — re-installing does not stack a second hook', () => {
		const once = withGuardHook({}, CMD)
		expect(withGuardHook(once, CMD)).toStrictEqual(once)
		expect(once.hooks?.UserPromptSubmit).toHaveLength(1)
	})

	it('replaces a guard hook left by an older install at a different path', () => {
		const stale = withGuardHook({}, '/old/path/usagefleet guard')
		const fresh = withGuardHook(stale, CMD)
		expect(fresh.hooks?.UserPromptSubmit).toHaveLength(1)
		expect(fresh.hooks?.UserPromptSubmit[0].hooks?.[0].command).toBe(CMD)
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
		expect(after.hooks?.UserPromptSubmit.map(g => g.hooks?.[0].command)).toStrictEqual(['spellcheck.sh', CMD])
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
