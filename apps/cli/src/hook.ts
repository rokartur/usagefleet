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
	args?: string[]
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

/** Exec form (`args`, Claude Code 2.1.139+): spawned without a shell. Shell form
 *  runs through Git Bash or PowerShell on Windows, which need opposite quoting.
 *  `--config` carries USAGEFLEET_CONFIG: the two-subscription setup
 *  (apps/cli/README.md) gives each account its own store and settings.json. */
export function guardHook(program: string[], configPath?: string): HookCommand {
	const [command, ...args] = program
	if (configPath) {
		args.push('--config', configPath)
	}
	return { args, command, timeout: HOOK_TIMEOUT_S, type: 'command' }
}

function isGuardHook(hook: HookCommand): boolean {
	return GUARD_COMMAND.test([hook.command, ...(hook.args ?? [])].join(' '))
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
			hooks: (g.hooks ?? []).filter(h => !isGuardHook(h)),
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
 *  instead of stacking a second hook. Drops `disableAllHooks`, which would
 *  switch the guard off without touching the hook itself. */
export function withGuardHook(settings: ClaudeSettings, hook: HookCommand): ClaudeSettings {
	const { disableAllHooks: _, ...base } = withoutGuardHook(settings)
	const groups = base.hooks?.UserPromptSubmit ?? []
	return {
		...base,
		hooks: {
			...base.hooks,
			UserPromptSubmit: [...groups, { hooks: [hook] }],
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

/** Register `usagefleet guard` as a Claude Code UserPromptSubmit hook, so a
 *  group with blocking enabled actually refuses prompts. No off-switch: whether
 *  a device blocks is decided on the dashboard, not on the device. */
export function installPromptHook(program: string[]): void {
	const hook = guardHook(program, process.env.USAGEFLEET_CONFIG)
	editSettings(
		s => withGuardHook(s, hook),
		path => console.log(step('hook', `prompt guard · ${tilde(path)}`)),
	)
}

export function uninstallPromptHook(): void {
	editSettings(withoutGuardHook, path => console.log(step('removed', `prompt guard · ${tilde(path)}`)))
}
