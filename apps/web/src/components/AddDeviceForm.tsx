import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { CheckIcon, CopyIcon, PlusIcon } from 'lucide-react'
import { useTranslations } from 'use-intl'
import { Button } from '@/components/arc/button/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/arc/dialog/dialog'
import { Input } from '@/components/arc/input/input'
import { Select } from '@/components/arc/select/select'
import { useToast } from '@/components/arc/toast-stack/toast-stack'
import { InstallCommand } from '@/components/InstallCommand'
import { createDevice } from '@/lib/actions'

/** The one-time token step. The plaintext token is never retrievable again, so
 *  what the user copies is the install command with the token already in it —
 *  the raw token stays available underneath for manual setups. */
function TokenReveal({ token, deviceName }: { token: string; deviceName: string }) {
	const t = useTranslations('dash.devices')
	const toast = useToast()
	const [copied, setCopied] = useState(false)
	return (
		<div className='flex flex-col gap-5'>
			<div className='flex flex-col gap-2'>
				<p className='font-medium'>{t('tokenStep1', { name: deviceName })}</p>
				<InstallCommand token={token} />
				<p className='text-muted-foreground'>{t('tokenStep1Hint')}</p>
			</div>

			<div className='flex flex-col gap-2'>
				<p className='font-medium'>{t('tokenStep2')}</p>
				<code className='rounded-lg bg-muted p-3 font-mono text-xs'>usagefleet status</code>
				<p className='text-muted-foreground'>{t('tokenStep2Hint')}</p>
			</div>

			<p className='text-muted-foreground'>{t('tokenMultiAccount')}</p>

			<details className='flex flex-col gap-2'>
				<summary className='cursor-pointer text-muted-foreground'>{t('tokenRaw')}</summary>
				<div className='mt-2 flex items-start gap-2'>
					<code className='min-w-0 flex-1 rounded-lg bg-muted p-3 font-mono text-xs break-all'>{token}</code>
					<Button
						variant='secondary'
						aria-label={t('copyToken')}
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(token)
								setCopied(true)
								toast.add({ title: t('tokenCopied'), type: 'success' })
							} catch {
								toast.add({
									description: t('copyTokenFailedHint'),
									title: t('copyTokenFailed'),
									type: 'error',
								})
							}
						}}
					>
						{copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
					</Button>
				</div>
			</details>
		</div>
	)
}

export function AddDeviceForm({ groups, atCap }: { groups: { id: string; name: string }[]; atCap: boolean }) {
	const t = useTranslations('dash.devices')
	const tActions = useTranslations('dash.actions')
	const toast = useToast()
	const [open, setOpen] = useState(false)
	const router = useRouter()
	const [name, setName] = useState('')
	// Default to the first group so a new device is never left ungrouped.
	const [groupId, setGroupId] = useState(groups[0]?.id ?? '')
	// Kept together so the token step can still name the device after the form
	// input is cleared.
	const [created, setCreated] = useState<{
		token: string
		name: string
	} | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string>()

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault()
		setLoading(true)
		setError(undefined)
		try {
			const res = await toast.promise(createDevice({ data: { groupId: groupId || null, name } }), {
				error: { description: tActions('retry'), title: t('createFailed') },
				loading: { title: t('creatingToast') },
				success: { title: t('created') },
			})
			setCreated({ name, token: res.token })
			setName('')
			// Refetch the device list so the new row (and the updated cap counter)
			// show up behind the dialog.
			await router.invalidate()
		} catch {
			setError(t('createFailedRetry'))
		} finally {
			setLoading(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				setOpen(next)
				if (!next) {
					setCreated(null)
					setError(undefined)
				}
			}}
		>
			<DialogTrigger render={<Button disabled={atCap} />}>
				<PlusIcon size={16} />
				{t('addDevice')}
			</DialogTrigger>
			<DialogContent
				title={created ? t('registered', { name: created.name }) : t('addDevice')}
				description={created ? t('registeredHint') : t('dialogDescription')}
			>
				{created ? (
					<>
						<TokenReveal token={created.token} deviceName={created.name} />
						<div className='mt-6 flex justify-end'>
							<DialogClose render={<Button variant='secondary' />}>{t('done')}</DialogClose>
						</div>
					</>
				) : (
					<form onSubmit={onSubmit} className='grid gap-5'>
						<Input
							label={t('name')}
							required
							value={name}
							onChange={e => setName(e.target.value)}
							placeholder={t('namePlaceholder')}
							description={t('nameDescription')}
							error={error}
						/>
						{/* With no groups yet the server creates a default one, so there is nothing to pick. */}
						{groups.length > 0 ? (
							<Select
								label={t('group')}
								description={t('groupDescription')}
								value={groupId}
								onValueChange={setGroupId}
								options={groups.map(g => ({ label: g.name, value: g.id }))}
							/>
						) : (
							<p className='text-muted-foreground'>{t('groupFallback')}</p>
						)}
						<div className='flex justify-end gap-2'>
							<DialogClose render={<Button variant='secondary' type='button' />}>
								{t('cancel')}
							</DialogClose>
							<Button type='submit' loading={loading}>
								{t('create')}
							</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	)
}
