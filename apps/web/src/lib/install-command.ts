/** Published on npm, so the same package installs on every OS with Node 20+. */
const PACKAGE = '@usagefleet/cli'

/** Stand-in used where the plaintext token isn't available any more (it is
 *  shown once, at device creation). Loud enough that nobody pastes it as-is. */
export const TOKEN_PLACEHOLDER = 'PASTE_YOUR_DEVICE_TOKEN'

/** The copy-paste setup one-liners for one device token, per shell: install the
 *  CLI, pair the device, enable the background service. Only the separator
 *  differs — Windows PowerShell 5.1 has no `&&`. The collector reports to
 *  usagefleet.com and nowhere else, so there is nothing to point anywhere. */
export function installCommands(token: string) {
	const steps = [`npm i -g ${PACKAGE}`, `usagefleet login ${token}`]
	return [
		{ command: steps.join(' && '), id: 'unix', label: 'macOS / Linux' },
		{ command: steps.join('; '), id: 'windows', label: 'Windows' },
	] as const
}
