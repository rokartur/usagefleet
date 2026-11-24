import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { useLocale, useTranslations } from 'use-intl'
import { ActionForm } from '@/components/ActionForm'
import { Alert } from '@/components/arc/alert/alert'
import { Button } from '@/components/arc/button/button'
import { PasswordField } from '@/components/arc/password-field/password-field'
import { db } from '@/db'
import { anthropicAdminKeys } from '@/db/schema'
import { removeAdminKey, saveAdminKey } from '@/lib/actions'
import { ADMIN_KEY_PREFIX, apiKeySpend } from '@/lib/anthropic-admin'
import { formatUsd } from '@/lib/format'
import { requireUser } from '@/lib/session'

const apiKeysData = createServerFn().handler(async () => {
	const user = await requireUser()
	const [stored] = await db
		.select({ ciphertext: anthropicAdminKeys.ciphertext, hint: anthropicAdminKeys.hint })
		.from(anthropicAdminKeys)
		.where(eq(anthropicAdminKeys.userId, user.id))
	if (!stored) {
		return { hint: null, spend: null, error: null }
	}
	try {
		return { hint: stored.hint, spend: await apiKeySpend(stored.ciphertext), error: null }
	} catch (error) {
		// A revoked key or an Anthropic outage still renders the page, so the key can be replaced.
		return { hint: stored.hint, spend: null, error: error instanceof Error ? error.message : String(error) }
	}
})

export const Route = createFileRoute('/_dash/api-keys')({
	loader: () => apiKeysData(),
	component: ApiKeysPage,
})

const card = 'rounded-(--radius-surface) border bg-surface p-6'

function ApiKeysPage() {
	const t = useTranslations('dash.apiKeys')
	const { hint, spend, error } = Route.useLoaderData()

	return (
		<div className='flex flex-col gap-6'>
			<section className={`${card} grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10`}>
				<div>
					<h2 className='text-sm font-medium'>{t('keyLabel')}</h2>
					<p className='mt-1 text-sm text-muted-foreground'>{t('keyLead')}</p>
				</div>
				<div className='min-w-0'>{hint ? <ConnectedKey hint={hint} /> : <ConnectKey />}</div>
			</section>

			{error && <Alert tone='danger' title={`${t('loadFailed')}: ${error}`} />}
			{spend && <SpendTable spend={spend} />}
		</div>
	)
}

function ConnectKey() {
	const t = useTranslations('dash.apiKeys')
	return (
		<ActionForm
			action={saveAdminKey}
			loadingMessage={t('connecting')}
			successMessage={t('connected')}
			errorMessage={t('connectFailed')}
			className='flex flex-col items-start gap-3'
		>
			<PasswordField
				label={t('keyLabel')}
				name='adminKey'
				required
				maxLength={256}
				autoComplete='off'
				placeholder={`${ADMIN_KEY_PREFIX}01-...`}
				className='w-full'
			/>
			<Button type='submit'>{t('connect')}</Button>
		</ActionForm>
	)
}

function ConnectedKey({ hint }: { hint: string }) {
	const t = useTranslations('dash.apiKeys')
	return (
		<ActionForm
			action={removeAdminKey}
			loadingMessage={t('disconnecting')}
			successMessage={t('disconnected')}
			className='flex items-center justify-between gap-4'
		>
			<span className='text-sm'>{t('connectedHint', { hint })}</span>
			<Button type='submit' variant='secondary' size='sm'>
				{t('disconnect')}
			</Button>
		</ActionForm>
	)
}

function SpendTable({ spend }: { spend: Awaited<ReturnType<typeof apiKeySpend>> }) {
	const t = useTranslations('dash.apiKeys')
	const locale = useLocale()
	return (
		<section className={card}>
			<h2 className='text-sm font-medium'>{t('spend')}</h2>
			<p className='mt-1 mb-4 text-sm text-muted-foreground'>{t('spendLead')}</p>
			{spend.rows.length === 0 ? (
				<p className='text-sm text-muted-foreground'>{t('empty')}</p>
			) : (
				<table className='w-full border-collapse text-sm tabular-nums'>
					<thead className='text-xs text-muted-foreground'>
						<tr>
							<th scope='col' className='pb-1 text-left font-normal'>
								{t('key')}
							</th>
							<th scope='col' className='w-24 pb-1 text-right font-normal max-sm:hidden'>
								{t('requests')}
							</th>
							<th scope='col' className='w-24 pb-1 text-right font-normal'>
								{t('spend')}
							</th>
						</tr>
					</thead>
					<tbody>
						{spend.rows.map(row => (
							<tr key={row.id ?? ''} className='border-t'>
								<td className='py-2 pr-3'>
									<div>{row.id ? (row.name ?? t('unknownKey')) : t('noKey')}</div>
									{row.id && (
										<div className='text-xs [overflow-wrap:anywhere] text-muted-foreground'>
											{[row.hint ?? row.id, row.status !== 'active' && row.status]
												.filter(Boolean)
												.join(' · ')}
										</div>
									)}
								</td>
								<td className='py-2 text-right max-sm:hidden'>
									{row.requests?.toLocaleString(locale) ?? '-'}
								</td>
								<td className='py-2 text-right'>{formatUsd(row.usd)}</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className='border-t font-medium'>
							<th scope='row' className='py-2 text-left font-medium'>
								{t('total')}
							</th>
							<td className='py-2 text-right max-sm:hidden'>
								<span className='sr-only'>{t('requests')}</span>
							</td>
							<td className='py-2 text-right'>{formatUsd(spend.totalUsd)}</td>
						</tr>
					</tfoot>
				</table>
			)}
			{spend.refreshedAt && (
				<p className='mt-4 text-xs text-muted-foreground'>
					{t('refreshed', {
						at: `${new Date(spend.refreshedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`,
					})}
				</p>
			)}
		</section>
	)
}
