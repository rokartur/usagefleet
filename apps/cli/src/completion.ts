/** The command list, shared by `help` and the generated completion scripts, so
 *  a new command can't land in one and be missing from the other. `args` is the
 *  hint `help` prints after the name; completion only needs the bare name. */
export const commands: readonly { name: string; args?: string; meaning: string }[] = [
	{ name: 'run', meaning: 'scan once, upload usage + report limits' },
	{ name: 'watch', args: '[--interval s]', meaning: 'poll continuously (default 15s)' },
	{ name: 'limits', meaning: 'report only your real 5h/weekly usage' },
	{ name: 'guard', meaning: 'exit 2 when the group is over a blocking limit' },
	{ name: 'update', meaning: 'update to the latest release now' },
	{ name: 'notify-test', meaning: 'fire a test desktop notification' },
	{ name: 'status', meaning: 'service health, limits, resolved config' },
	{ name: 'config', meaning: 'config file location and env overrides' },
	{ name: 'completion', args: '<zsh|fish>', meaning: 'print a shell completion script' },
	{ name: 'version', meaning: 'print the release version' },
	{ name: 'install', args: '--token <t>', meaning: 'configure + install the service and prompt guard' },
	{ name: 'uninstall', meaning: 'remove the service and the guard' },
]

export const shells = ['zsh', 'fish'] as const
export type Shell = (typeof shells)[number]

/** A completion script for `shell`, on stdout — the user decides where it goes
 *  (`> ~/.zsh/completions/_usagefleet`, `> ~/.config/fish/completions/…`).
 *  Writing those files ourselves would mean guessing at fpath and rc files. */
export function completionScript(shell: Shell): string {
	return shell === 'zsh' ? zsh() : fish()
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
