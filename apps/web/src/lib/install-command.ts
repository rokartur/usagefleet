import { siteUrl } from '@/lib/site'

/** The hosted service, which is also the collector's built-in default endpoint.
 *  Self-hosted deployments have to spell the endpoint out; on the hosted one the
 *  flag would just be noise. */
const HOSTED_ORIGIN = 'https://usagefleet.com'

/** Published on npm, so the same package installs on every OS with Node 20+. */
const PACKAGE = '@usagefleet/cli'

/** Stand-in used where the plaintext token isn't available any more (it is
 *  shown once, at device creation). Loud enough that nobody pastes it as-is. */
export const TOKEN_PLACEHOLDER = 'PASTE_YOUR_DEVICE_TOKEN'

/** The copy-paste setup one-liners for one device token, per shell: install the
 *  CLI, point it at this deployment, enable the background service. Only the
 *  separator differs — Windows PowerShell 5.1 has no `&&`. */
export function installCommands(token: string) {
	const origin = siteUrl()
	const endpoint = origin === HOSTED_ORIGIN ? '' : ` --endpoint ${origin}`
	const steps = [`npm i -g ${PACKAGE}`, `usagefleet install --token ${token}${endpoint}`]
	return [
		{ command: steps.join(' && '), id: 'unix', label: 'macOS / Linux' },
		{ command: steps.join('; '), id: 'windows', label: 'Windows' },
	] as const
}
