import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { writeFileAtomic } from './atomic-write.js'

/** The user-facing command list, shared by `help` and the generated completion
 *  scripts, so a command can't land in one and be missing from the other. `args`
 *  is the hint `help` prints after the name; completion only needs the bare name.
 *
 *  `watch` is deliberately absent: it is the entrypoint the installed service
 *  runs, not something to type. It still dispatches — every plist and unit on
 *  disk names it — it just isn't advertised. So are `install`/`init`, the former
 *  names of `login`, kept dispatching for commands already pasted into scripts. */
export const commands: readonly { name: string; args?: string; meaning: string }[] = [
	{ name: 'run', meaning: 'scan once, upload usage + report limits' },
	{ name: 'limits', meaning: 'report only your real 5h/weekly usage' },
	{ name: 'guard', meaning: 'exit 2 when the group is over a blocking limit' },
	{ name: 'update', meaning: 'update to the latest release now' },
	{ name: 'notify-test', meaning: 'fire a test desktop notification' },
	{ name: 'status', meaning: 'service health, limits, resolved config' },
	{ name: 'config', meaning: 'config file location and env overrides' },
	{ name: 'completion', args: '<zsh|fish>', meaning: 'print a shell completion script' },
	{ name: 'login', args: '<token>', meaning: 'pair this device, install the service and prompt guard' },
	{ name: 'uninstall', meaning: 'remove the service and the guard' },
]

export const shells = ['zsh', 'fish'] as const
export type Shell = (typeof shells)[number]

/** A completion script for `shell`, on stdout. `install` writes these to the
 *  right place automatically; this command stays for piping one somewhere else. */
export function completionScript(shell: Shell): string {
	return shell === 'zsh' ? zsh() : fish()
}

/** Sentinels around our .zshrc block, so `uninstall` removes exactly what we
 *  added even after the user has edited around it. */
const RC_START = '# >>> usagefleet completions >>>'
const RC_END = '# <<< usagefleet completions <<<'

// Resolved per call, not once at import: homedir() is what the tests vary, and
// service.ts derives its paths the same way.
const zshDir = () => join(homedir(), '.zsh', 'completions')
const zshrc = () => join(homedir(), '.zshrc')

/** Where each shell loads completions from. fish scans its directory with no
 *  further setup; zsh only scans what is on fpath, which is why zsh also needs
 *  the .zshrc block. */
function completionPath(shell: Shell): string {
	return shell === 'fish'
		? join(homedir(), '.config', 'fish', 'completions', 'usagefleet.fish')
		: join(zshDir(), '_usagefleet')
}

/** Only touch a shell the user actually runs — as the login shell or by already
 *  having its config on disk. Installing should not scatter dotfiles for shells
 *  that were never used. */
function shellInUse(shell: Shell): boolean {
	if ((process.env.SHELL ?? '').includes(shell)) {
		return true
	}
	return existsSync(shell === 'fish' ? join(homedir(), '.config', 'fish') : zshrc())
}

/**
 * Put the completion scripts where each shell looks, and for zsh make sure that
 * directory is on fpath. Re-running is a no-op beyond rewriting the scripts, so
 * self-update refreshes completions for free.
 *
 * Returns one row per shell touched: the script path, plus the rc file when this
 * call was the one that added the block.
 */
export function installCompletions(): { shell: Shell; path: string; rc?: string }[] {
	const done: { shell: Shell; path: string; rc?: string }[] = []
	for (const shell of shells) {
		if (!shellInUse(shell)) {
			continue
		}
		const path = completionPath(shell)
		mkdirSync(dirname(path), { recursive: true })
		writeFileAtomic(path, completionScript(shell))
		done.push(shell === 'zsh' ? { shell, path, rc: ensureZshFpath() } : { shell, path })
	}
	return done
}

/** Append the fpath block to .zshrc, once. Returns the file when this call added
 *  it, undefined when it was already there. */
function ensureZshFpath(): string | undefined {
	const rc = zshrc()
	const current = existsSync(rc) ? readFileSync(rc, 'utf-8') : ''
	if (current.includes(RC_START)) {
		return undefined
	}
	// Appended, never prepended: fpath has to be set before the compinit that
	// reads it, and we cannot know whether the user already ran compinit earlier
	// in the file. Adding our own after theirs is the only ordering that works
	// from the end of the file; -C skips the dump check so the second run is cheap.
	const block = `${RC_START}\nfpath=("${zshDir().replace(homedir(), '$HOME')}" $fpath)\nautoload -Uz compinit && compinit -C\n${RC_END}\n`
	writeFileAtomic(rc, current === '' || current.endsWith('\n') ? current + block : `${current}\n${block}`)
	return rc
}

/** Undo installCompletions: drop the scripts and strip the .zshrc block. */
export function removeCompletions(): void {
	for (const shell of shells) {
		rmSync(completionPath(shell), { force: true })
	}
	const rc = zshrc()
	if (!existsSync(rc)) {
		return
	}
	const current = readFileSync(rc, 'utf-8')
	const start = current.indexOf(RC_START)
	const end = current.indexOf(RC_END)
	if (start === -1 || end < start) {
		return
	}
	writeFileAtomic(rc, current.slice(0, start) + current.slice(end + RC_END.length).replace(/^\n/, ''))
}

function zsh(): string {
	// zsh splits a _describe entry on the first colon, so any colon in the text
	// has to be escaped or the description gets cut in half.
	const rows = commands.map(c => `\t\t'${c.name}:${c.meaning.replaceAll(':', '\\:')}'`).join('\n')
	return `#compdef usagefleet

_usagefleet() {
	local -a commands
	commands=(
${rows}
	)
	if (( CURRENT == 2 )); then
		_describe 'command' commands
	elif [[ $words[2] == completion ]]; then
		_values 'shell' ${shells.join(' ')}
	fi
}

_usagefleet "$@"
`
}

function fish(): string {
	const quote = (s: string) => s.replaceAll("'", "\\'")
	const rows = commands
		.map(c => `complete -c usagefleet -n __fish_use_subcommand -a ${c.name} -d '${quote(c.meaning)}'`)
		.join('\n')
	// -f: no file completion, this CLI takes no paths.
	return `complete -c usagefleet -f
${rows}
complete -c usagefleet -n '__fish_seen_subcommand_from completion' -a '${shells.join(' ')}'
`
}
