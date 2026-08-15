import { loadConfig } from './config.js'
import type { Config } from './types.js'

/** Hooks run on the interactive path — a slow/hung server must not stall a
 *  prompt for long. On timeout we fail open (see {@link runGuard}). */
const TIMEOUT_MS = 5000

/** The parts of GET /api/v1/limits that decide whether a prompt may proceed.
 *  Every field is optional: a server older than this feature simply omits them,
 *  which reads as "not blocked". */
export interface GuardView {
	group?: string | null
	sessionPct?: number
	weeklyPct?: number
	blocked?: boolean
	blockedWindow?: 'session' | 'weekly' | null
	blockedUntil?: string | null
}

/**
 * The message shown to the user when the prompt is refused, or null to let it
 * through. Only an explicit `blocked: true` blocks — anything unexpected
 * (missing fields, old server, junk) falls through to null on purpose, so a
 * tracker problem can never stop someone from working.
 */
export function blockMessage(view: GuardView): string | null {
	if (view.blocked !== true) {
		return null
	}
	const weekly = view.blockedWindow === 'weekly'
	const pct = (weekly ? view.weeklyPct : view.sessionPct) ?? 100
	const group = view.group ? `"${view.group}"` : 'this group'
	const until = view.blockedUntil ? new Date(view.blockedUntil) : null
	const resets =
		until && !Number.isNaN(until.getTime())
			? ` Resets ${until.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}.`
			: ''
	return (
		`usagefleet: ${group} has used ${pct}% of its ${weekly ? 'weekly' : '5h'} budget, ` +
		`so new prompts are blocked.${resets}`
	)
}

/**
 * Exit code for `usagefleet guard`, the Claude Code `UserPromptSubmit` hook:
 * 2 refuses the prompt (stderr is shown to the user), 0 lets it through.
 * Prints nothing on stdout — on this hook stdout is injected into the model's
 * context.
 */
export async function runGuard(): Promise<number> {
	let cfg: Config
	try {
		cfg = loadConfig()
	} catch {
		return 0 // not configured on this machine — nothing to enforce
	}

	let view: GuardView
	try {
		const res = await fetch(`${cfg.endpoint}/api/v1/limits`, {
			headers: { 'x-api-key': cfg.token },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
		if (!res.ok) {
			return 0
		}
		view = (await res.json()) as GuardView
	} catch {
		return 0 // offline / timeout / bad JSON — fail open
	}

	const msg = blockMessage(view)
	if (!msg) {
		return 0
	}
	process.stderr.write(`${msg}\n`)
	return 2
}
