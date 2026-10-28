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

const OAUTH_PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile'

interface JcodeAuthFile {
	active_anthropic_account?: unknown
	anthropic_accounts?: { label?: unknown; access?: unknown }[]
}

/** The OAuth access token of the login jcode (or pj) has active in its `auth.json`,
 *  falling back to the first saved login the way jcode does. Null when unreadable. */
export function activeJcodeToken(authPath: string): string | null {
	try {
		const auth = JSON.parse(readFileSync(authPath, 'utf-8')) as JcodeAuthFile
		const accounts = auth.anthropic_accounts ?? []
		const active = accounts.find(a => a.label === auth.active_anthropic_account) ?? accounts[0]
		return typeof active?.access === 'string' && active.access !== '' ? active.access : null
	} catch {
		return null
	}
}

/** pi's Anthropic OAuth access token from its `auth.json` (`{ anthropic: { type, access, expires } }`),
 *  or null when missing or expired; pi refreshes it only when it runs. */
export function piClaudeToken(authPath: string): string | null {
	try {
		const { anthropic } = JSON.parse(readFileSync(authPath, 'utf-8')) as {
			anthropic?: { type?: unknown; access?: unknown; expires?: unknown }
		}
		const fresh =
			anthropic?.type === 'oauth' && typeof anthropic.expires === 'number' && anthropic.expires > Date.now()
		return fresh && typeof anthropic.access === 'string' && anthropic.access !== '' ? anthropic.access : null
	} catch {
		return null
	}
}

interface AgentAccount {
	type?: unknown
	name?: unknown
	access?: unknown
	accountId?: unknown
	expires?: unknown
}

/** Every Claude subscription login saved in the agent CLI's `accounts.json` whose access
 *  token has not expired; the agent refreshes a token only when it uses that account. */
export function agentClaudeLogins(accountsPath: string): { extId: string; name: string; token: string }[] {
	let accounts: AgentAccount[]
	try {
		accounts = (JSON.parse(readFileSync(accountsPath, 'utf-8')) as { anthropic?: AgentAccount[] }).anthropic ?? []
	} catch {
		return []
	}
	const logins = []
	for (const { type, name, access, accountId, expires } of accounts) {
		if (
			type === 'oauth' &&
			typeof access === 'string' &&
			access !== '' &&
			typeof accountId === 'string' &&
			accountId !== '' &&
			typeof expires === 'number' &&
			expires > Date.now()
		) {
			logins.push({
				extId: accountId.slice(0, 100),
				name: typeof name === 'string' ? name : accountId,
				token: access,
			})
		}
	}
	return logins
}

/** The accountUuid Anthropic says owns this OAuth token, or null when it cannot
 *  say. Null fails open to the file's identity: the endpoint is undocumented, and
 *  losing it must not stop every collector from reporting limits. */
export async function tokenOwner(token: string): Promise<string | null> {
	try {
		const res = await fetch(OAUTH_PROFILE_URL, {
			headers: {
				'anthropic-beta': 'oauth-2025-04-20',
				authorization: `Bearer ${token}`,
				'user-agent': 'claude-code/2.1.5 (usagefleet)',
			},
			signal: AbortSignal.timeout(15_000),
		})
		if (!res.ok) {
			return null
		}
		const body = (await res.json()) as { account?: { uuid?: unknown } } | null
		const uuid = body?.account?.uuid
		return typeof uuid === 'string' && uuid !== '' ? uuid.slice(0, 100) : null
	} catch {
		return null
	}
}
