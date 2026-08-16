import { describe, expect, it } from 'vitest'
import type { ClaudeAccount } from '@/db/schema'
import { accountViews, inAccount } from '@/lib/data'

/** Only the fields the view rules read; the rest of the row is limit columns. */
const account = (id: string, extId: string | null, createdAt: string) =>
	({ createdAt: new Date(createdAt), extId, id, userId: 'u1' }) as ClaudeAccount

describe(accountViews, () => {
	it('gives a fleet with no reports one placeholder view', () => {
		const [view, ...rest] = accountViews([], 'u1')
		expect(rest).toStrictEqual([])
		expect(view.account).toBeNull()
		expect(view.absorbsUnstamped).toBeTruthy()
	})

	it('puts the unidentified bucket first, then oldest account first', () => {
		const views = accountViews(
			[
				account('b', 'uuid-b', '2024-02-01'),
				account('a', 'uuid-a', '2024-01-01'),
				account('bucket', null, '2024-03-01'),
			],
			'u1',
		)
		expect(views.map(v => v.account?.id)).toStrictEqual(['bucket', 'a', 'b'])
	})

	it('only lets the unidentified bucket absorb unstamped devices', () => {
		const views = accountViews([account('bucket', null, '2024-01-01'), account('a', 'uuid-a', '2024-01-02')], 'u1')
		expect(views.map(v => v.absorbsUnstamped)).toStrictEqual([true, false])
	})

	it('lets a lone identified account absorb them, so one subscription still adds up', () => {
		const [view] = accountViews([account('a', 'uuid-a', '2024-01-01')], 'u1')
		expect(view.absorbsUnstamped).toBeTruthy()
		expect(inAccount(view, null)).toBeTruthy()
		expect(inAccount(view, 'a')).toBeTruthy()
	})
})

describe(inAccount, () => {
	const [bucket, a] = accountViews(
		[account('bucket', null, '2024-01-01'), account('a', 'uuid-a', '2024-01-02')],
		'u1',
	)

	it('keeps each account to its own devices', () => {
		expect(inAccount(a, 'a')).toBeTruthy()
		expect(inAccount(a, 'bucket')).toBeFalsy()
		expect(inAccount(bucket, 'a')).toBeFalsy()
	})

	it('sends devices that never reported a login to the bucket only', () => {
		expect(inAccount(bucket, null)).toBeTruthy()
		expect(inAccount(a, null)).toBeFalsy()
	})
})
