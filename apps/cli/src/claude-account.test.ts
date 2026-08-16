import { describe, expect, it } from 'vitest'
import { parseClaudeAccount } from './claude-account.js'

describe(parseClaudeAccount, () => {
	it('reads the uuid and labels out of a Claude Code state file', () => {
		expect(
			parseClaudeAccount({
				oauthAccount: {
					accountUuid: 'acc-1',
					emailAddress: 'me@example.com',
					organizationName: 'Personal',
				},
				projects: {},
			}),
		).toStrictEqual({ email: 'me@example.com', extId: 'acc-1', org: 'Personal' })
	})

	it('keeps the account when only the uuid is present', () => {
		expect(parseClaudeAccount({ oauthAccount: { accountUuid: 'acc-1' } })).toStrictEqual({
			email: null,
			extId: 'acc-1',
			org: null,
		})
	})

	it('reports no account rather than a partial one', () => {
		expect(parseClaudeAccount({})).toBeNull()
		expect(parseClaudeAccount({ oauthAccount: {} })).toBeNull()
		expect(parseClaudeAccount({ oauthAccount: { accountUuid: '' } })).toBeNull()
		expect(parseClaudeAccount(null)).toBeNull()
		expect(parseClaudeAccount('nope')).toBeNull()
	})
})
