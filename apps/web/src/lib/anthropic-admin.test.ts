import { describe, expect, it } from 'vitest'
import { spendRows } from './anthropic-admin'

describe('API key spend rows', () => {
	it('turns cent strings into dollars, names known keys and keeps keyless usage', () => {
		const rows = spendRows(
			[
				{ cost: { amount: '1250.500000', requests: 3 }, group: { api_key_id: 'apikey_a' } },
				{ cost: { amount: '41280.000000', requests: null }, group: { api_key_id: null } },
				{ cost: { amount: '99.000000' }, group: { api_key_id: 'apikey_gone' } },
			],
			[{ id: 'apikey_a', name: 'CI', partial_key_hint: 'sk-ant-api03-R2D...igAA', status: 'active' }],
		)
		expect(rows).toStrictEqual([
			{ hint: null, id: null, name: null, requests: null, status: null, usd: 412.8 },
			{ hint: 'sk-ant-api03-R2D...igAA', id: 'apikey_a', name: 'CI', requests: 3, status: 'active', usd: 12.505 },
			{ hint: null, id: 'apikey_gone', name: null, requests: null, status: null, usd: 0.99 },
		])
	})
})
