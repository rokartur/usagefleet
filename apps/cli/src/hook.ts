import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeFileAtomic } from './atomic-write.js'
import { claudeSettingsPath } from './paths.js'
import { step, tilde, warn } from './ui.js'

/** Outer bound on the hook, in seconds. runGuard's own fetch gives up after 5s
 *  and fails open; this only matters if the process itself wedges. */
const HOOK_TIMEOUT_S = 10

/** Recognises a guard hook we installed (at any binary path, from any version)
 *  so install is idempotent and uninstall is precise. */
const GUARD_COMMAND = /usagefleet.*\bguard\b/

interface HookCommand {
	type?: string
	command?: string
	timeout?: number
}
interface HookGroup {
	matcher?: string
	hooks?: HookCommand[]
}
/** Only the shape we touch; everything else in the user's settings is opaque
 *  and must survive a round-trip untouched. */
interface ClaudeSettings {
	hooks?: Record<string, HookGroup[]>
	[key: string]: unknown
}

/** `/path/to/usagefleet guard`, quoted for the shell Claude Code runs it in.
 *  Carries USAGEFLEET_CONFIG through when set: the documented two-subscription
 *  setup (apps/cli/README.md) gives each account its own store *and* its own
 *  Claude settings.json, so without it both hooks would read the default config
 *  and block against the wrong account. `platform` is a parameter so the two
 *  shells can be tested; cmd.exe has no inline `VAR=value cmd` form, and the
 *  POSIX prefix there would be read as a program name and never launch. */
export function guardCommand(program: string[], configPath?: string, platform: string = process.platform): string {
	const quote = (p: string) => (p.includes(' ') ? `"${p}"` : p)
	const command = program.map(quote).join(' ')
	if (!configPath) {
		return command
	}
	return platform === 'win32'
		? `set "USAGEFLEET_CONFIG=${configPath}" && ${command}`
		: `USAGEFLEET_CONFIG=${quote(configPath)} ${command}`
}

/** Drop every guard hook we ever installed, leaving the rest of the file alone. */
export function withoutGuardHook(settings: ClaudeSettings): ClaudeSettings {
	const groups = settings.hooks?.UserPromptSubmit
	if (!groups) {
		return settings
	}
	const kept = groups
		.map(g => ({
			...g,
			hooks: (g.hooks ?? []).filter(h => !GUARD_COMMAND.test(h.command ?? '')),
		}))
		.filter(g => g.hooks.length > 0)
	const hooks = { ...settings.hooks }
	if (kept.length > 0) {
		hooks.UserPromptSubmit = kept
	} else {
		delete hooks.UserPromptSubmit
	}
	return {
		...settings,
		hooks: Object.keys(hooks).length > 0 ? hooks : undefined,
	}
}

/** Strip-then-append, so re-running install refreshes a stale binary path
 *  instead of stacking a second hook. */
export function withGuardHook(settings: ClaudeSettings, command: string): ClaudeSettings {
	const base = withoutGuardHook(settings)
	const groups = base.hooks?.UserPromptSubmit ?? []
	return {
		...base,
		hooks: {
			...base.hooks,
			UserPromptSubmit: [...groups, { hooks: [{ command, timeout: HOOK_TIMEOUT_S, type: 'command' }] }],
		},
	}
}

/** Read → transform → write ~/.claude/settings.json, skipping the write when
 *  nothing changed. Refuses to touch a file it cannot parse: a hand-edited
 *  settings file is worth more than this hook. */
function editSettings(transform: (s: ClaudeSettings) => ClaudeSettings, onWrite: (path: string) => void): void {
	const path = claudeSettingsPath()
	let raw = ''
	try {
		raw = readFileSync(path, 'utf-8')
	} catch {
		/* no settings file yet */
	}

	let settings: ClaudeSettings = {}
	if (raw.trim()) {
		try {
			const parsed: unknown = JSON.parse(raw)
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				throw new Error('settings JSON is not an object')
			}
			settings = parsed as ClaudeSettings
		} catch {
			console.log(warn('hook', `${tilde(path)} is not valid JSON · left untouched`))
			return
		}
	}

	const next = transform(settings)
	if (JSON.stringify(next) === JSON.stringify(settings)) {
		return
	}
	mkdirSync(dirname(path), { recursive: true })
	// Atomic: this file is the user's, not ours, and an interrupted write would
	// truncate their whole Claude Code configuration for the sake of our hook.
	writeFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`)
	onWrite(path)
}

/**
 * Register `usagefleet guard` as a Claude Code UserPromptSubmit hook, so a
 * group with blocking enabled actually refuses prompts. Called by
 * `usagefleet login`; set USAGEFLEET_HOOK=0 to keep settings.json
 * untouched.
 */
export function installPromptHook(program: string[]): void {
	if (process.env.USAGEFLEET_HOOK === '0') {
		return
	}
	const command = guardCommand(program, process.env.USAGEFLEET_CONFIG)
	editSettings(
		s => withGuardHook(s, command),
		path => console.log(step('hook', `prompt guard · ${tilde(path)}`)),
	)
}

export function uninstallPromptHook(): void {
	editSettings(withoutGuardHook, path => console.log(step('removed', `prompt guard · ${tilde(path)}`)))
}
