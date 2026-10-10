import { useState, useTransition } from 'react'
import { useRouter } from '@tanstack/react-router'
import { PencilIcon, PlusIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'use-intl'
import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/arc/dialog/dialog'
import { Input } from '@/components/arc/input/input'
import { NumberField } from '@/components/arc/number-field/number-field'
import { useToast } from '@/components/arc/toast-stack/toast-stack'
import { createGroup, updateGroup } from '@/lib/actions'
import { GROUP_COLORS, randomGroupColor } from '@/lib/group-colors'
import { cn } from '@/lib/utils'

/** Swatch picker over the shared palette. Native radios rather than buttons:
 *  arrow-key navigation and form serialisation come for free, so the only state
 *  is the colour a new group opens on. */
function ColorField({ selected }: { selected?: string }) {
	const t = useTranslations('dash.groups')
	const [initial] = useState(() => selected ?? randomGroupColor())
	// A group saved with a hex outside the palette keeps its swatch, otherwise
	// editing it would silently show nothing selected. Its label stays the raw
	// hex, which is the only name that off-palette colour has.
	const swatches: { hex: string; label: string }[] = [
		...(GROUP_COLORS.some(c => c.hex === initial) ? [] : [{ hex: initial, label: initial }]),
		...GROUP_COLORS.map(c => ({ hex: c.hex, label: t(`color${c.name}`) })),
	]

	return (
		<fieldset className='grid gap-2'>
			<legend className='mb-2 text-sm font-medium'>{t('color')}</legend>
			<div className='flex flex-wrap gap-2'>
				{swatches.map(c => (
					<label key={c.hex} className='cursor-pointer'>
						<input
							type='radio'
							name='color'
							value={c.hex}
							defaultChecked={c.hex === initial}
							aria-label={c.label}
							className='peer sr-only'
						/>
						<span
							style={{ backgroundColor: c.hex }}
							className={cn(
								'block size-6 rounded-full ring-offset-2 ring-offset-background',
								'peer-checked:ring-2 peer-checked:ring-foreground',
								'peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
							)}
						/>
					</label>
				))}
			</div>
			<p className='text-sm text-muted-foreground'>{t('colorDescription')}</p>
		</fieldset>
	)
}

/** Create (no `group`) or edit (with `group`) — one dialog, since the fields
 *  and the server-action shape are identical. */
export function GroupFormDialog({
	group,
	atCap = false,
}: {
	group?: {
		id: string
		name: string
		color: string
		blockOnSessionLimit: boolean
		blockOnWeeklyLimit: boolean
		sliceWeight: number
		watchOnly: boolean
	}
	atCap?: boolean
}) {
	const t = useTranslations('dash.groups')
	const tActions = useTranslations('dash.actions')
	const locale = useLocale()
	const toast = useToast()
	const [open, setOpen] = useState(false)
	const router = useRouter()
	const [pending, startTransition] = useTransition()
	const [sliceWeight, setSliceWeight] = useState(group?.sliceWeight ?? 1)
	const editing = group != null

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button
						variant={editing ? 'ghost' : 'secondary'}
						size={editing ? 'sm' : 'md'}
						disabled={!editing && atCap}
					/>
				}
			>
				{editing ? <PencilIcon size={16} /> : <PlusIcon size={16} />}
				{t(editing ? 'edit' : 'newTitle')}
			</DialogTrigger>
			<DialogContent title={t(editing ? 'editTitle' : 'newTitle')} description={t('dialogDescription')}>
				<form
					className='grid gap-5'
					onSubmit={event => {
						event.preventDefault()
						const formData = new FormData(event.currentTarget)
						startTransition(async () => {
							try {
								const submit = editing ? updateGroup : createGroup
								await toast.promise(
									submit({ data: formData }).then(() => router.invalidate()),
									{
										error: {
											description: tActions('retry'),
											title: t(editing ? 'updateFailed' : 'createFailed'),
										},
										loading: {
											title: t(editing ? 'savingGroup' : 'creating'),
										},
										success: {
											title: t(editing ? 'updated' : 'created'),
										},
									},
								)
								setOpen(false)
							} catch {
								// The toast reports the error; keep the dialog open for retry.
							}
						})
					}}
				>
					{editing && <input type='hidden' name='id' value={group.id} />}
					<Input
						label={t('name')}
						name='name'
						required
						maxLength={60}
						defaultValue={group?.name}
						placeholder={t('namePlaceholder')}
					/>
					<ColorField selected={group?.color} />
					<div>
						<NumberField
							label={t('sliceWeight')}
							description={t('sliceWeightDescription')}
							value={sliceWeight}
							onValueChange={setSliceWeight}
							min={1}
							max={100}
							locale={locale}
						/>
						<input type='hidden' name='sliceWeight' value={sliceWeight} />
					</div>
					<Checkbox
						name='watchOnly'
						label={t('watchOnly')}
						description={t('watchOnlyDescription')}
						defaultChecked={group?.watchOnly}
					/>
					<fieldset className='grid gap-3'>
						<legend className='mb-2 text-sm font-medium'>{t('blocking')}</legend>
						<Checkbox
							name='blockOnSessionLimit'
							label={t('blockSession')}
							description={t('blockSessionDescription')}
							defaultChecked={group?.blockOnSessionLimit}
						/>
						<Checkbox
							name='blockOnWeeklyLimit'
							label={t('blockWeekly')}
							description={t('blockWeeklyDescription')}
							defaultChecked={group?.blockOnWeeklyLimit}
						/>
						<p className='text-sm text-muted-foreground'>
							{t.rich('blockingHint', { cmd: chunks => <code>{chunks}</code> })}
						</p>
					</fieldset>
					<div className='flex justify-end gap-2'>
						<DialogClose render={<Button variant='secondary' type='button' />}>{t('cancel')}</DialogClose>
						<Button type='submit' loading={pending}>
							{t(editing ? 'save' : 'create')}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}
