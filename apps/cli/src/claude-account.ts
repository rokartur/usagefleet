import { readFileSync } from 'node:fs'
import { claudeStatePath } from './paths.js'

/**
 * Which Anthropic account this machine is logged into. Reported with every
 * limits post so the server can keep one set of rate-limit percentages per
 * account instead of one per UsageFleet user — a fleet spread over two Claude
 * subscriptions has two independent budgets.
 */
export interface ClaudeAccount {
	/** `oauthAccount.accountUuid` — stable across logins and machines. */
	extId: string
	email: string | null
	org: string | null
}

/** Pull the account out of a parsed `~/.claude.json`. Everything but the uuid is
 *  cosmetic, so a missing display field yields null rather than no account. */
export function parseClaudeAccount(raw: unknown): ClaudeAccount | null {
	if (typeof raw !== 'object' || raw === null) {
		return null
	}
	const acc = (raw as { oauthAccount?: unknown }).oauthAccount
	if (typeof acc !== 'object' || acc === null) {
		return null
	}
	const { accountUuid, emailAddress, organizationName } = acc as Record<string, unknown>
	if (typeof accountUuid !== 'string' || accountUuid === '') {
		return null
	}
	const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v.slice(0, 200) : null)
	return { email: str(emailAddress), extId: accountUuid.slice(0, 100), org: str(organizationName) }
}

/**
 * Read the local Claude Code login. Purely a local file read — no network, no
 * credentials — so it is safe to call on every limits cycle. Returns null when
 * Claude Code has never signed in on this machine (an ANTHROPIC_API_KEY-only
 * setup has no account identity at all); those devices fall back to the
 * server's unidentified-account bucket, i.e. today's behaviour.
 */
export function detectClaudeAccount(path = claudeStatePath()): ClaudeAccount | null {
	try {
		return parseClaudeAccount(JSON.parse(readFileSync(path, 'utf-8')))
	} catch {
		return null
	}
}
