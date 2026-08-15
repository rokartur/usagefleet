import { useState, useTransition } from 'react'
import { useRouter } from '@tanstack/react-router'
import { PencilIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { createGroup, updateGroup } from '@/lib/actions'
import { GROUP_COLORS, randomGroupColor } from '@/lib/group-colors'
import { cn } from '@/lib/utils'

/** Swatch picker over the shared palette. Native radios rather than buttons:
 *  arrow-key navigation and form serialisation come for free, so the only state
 *  is the colour a new group opens on. */
function ColorField({ selected }: { selected?: string }) {
	const [initial] = useState(() => selected ?? randomGroupColor())
	// A group saved with a hex outside the palette keeps its swatch, otherwise
	// editing it would silently show nothing selected.
	const swatches = GROUP_COLORS.some(c => c.hex === initial)
		? GROUP_COLORS
		: [{ hex: initial, name: initial }, ...GROUP_COLORS]

	return (
		<FieldSet>
			<FieldLegend variant='label' className='mb-2'>
				Color
			</FieldLegend>
			<div className='flex flex-wrap gap-2'>
				{swatches.map(c => (
					<label key={c.hex} className='cursor-pointer'>
						<input
							type='radio'
							name='color'
							value={c.hex}
							defaultChecked={c.hex === initial}
							aria-label={c.name}
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
			<FieldDescription>Used for this group everywhere in the charts.</FieldDescription>
		</FieldSet>
	)
}

/** One blocking switch. Off by default: a group only ever blocks itself, and
 *  only once its owner turns this on. */
function BlockField({ name, label, description, defaultChecked }: BlockFieldProps) {
	return (
		<Field orientation='horizontal'>
			<Checkbox id={name} name={name} defaultChecked={defaultChecked} />
			<FieldContent>
				<FieldLabel htmlFor={name} className='font-normal'>
					{label}
				</FieldLabel>
				<FieldDescription>{description}</FieldDescription>
			</FieldContent>
		</Field>
	)
}

interface BlockFieldProps {
	name: 'blockOnSessionLimit' | 'blockOnWeeklyLimit'
	label: string
	description: string
	defaultChecked?: boolean
}

/** Create (no `group`) or edit (with `group`) — one dialog, since the fields
 *  and the server-action shape are identical. */
export function GroupFormDialog({
	group,
	atCap = false,
}: {
	group?: { id: string; name: string; color: string; blockOnSessionLimit: boolean; blockOnWeeklyLimit: boolean }
	atCap?: boolean
}) {
	const [open, setOpen] = useState(false)
	const router = useRouter()
	const [pending, startTransition] = useTransition()
	const editing = group != null

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={editing ? <Button variant='ghost' size='sm' /> : <Button disabled={atCap} />}>
				{editing ? <PencilIcon /> : <PlusIcon />}
				{editing ? 'Edit' : 'New group'}
			</DialogTrigger>
			<DialogContent>
				<form
					className='grid gap-4'
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
											description: 'Please try again.',
											priority: 'high',
											title: editing ? "Couldn't update group" : "Couldn't create group",
										},
										loading: {
											title: editing ? 'Saving group…' : 'Creating group…',
										},
										success: {
											title: editing ? 'Group updated' : 'Group created',
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
					<DialogHeader>
						<DialogTitle>{editing ? 'Edit group' : 'New group'}</DialogTitle>
						<DialogDescription>
							Groups split your account limits between sets of machines.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor='group-name'>Name</FieldLabel>
							<Input
								id='group-name'
								name='name'
								required
								maxLength={60}
								defaultValue={group?.name}
								placeholder='e.g. Laptops'
							/>
						</Field>
						<ColorField selected={group?.color} />
						<FieldSet>
							<FieldLegend variant='label' className='mb-2'>
								Blocking
							</FieldLegend>
							<BlockField
								name='blockOnSessionLimit'
								label='Block at 100% of the 5-hour slice'
								description="Refuse new prompts on this group's devices until the 5-hour window resets."
								defaultChecked={group?.blockOnSessionLimit}
							/>
							<BlockField
								name='blockOnWeeklyLimit'
								label='Block at 100% of the weekly slice'
								description='Same, for the weekly window.'
								defaultChecked={group?.blockOnWeeklyLimit}
							/>
							<FieldDescription>
								Enforced by the collector&apos;s prompt hook, installed by{' '}
								<code>usagefleet install</code>.
							</FieldDescription>
						</FieldSet>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant='outline' type='button' />}>Cancel</DialogClose>
						<Button type='submit' disabled={pending}>
							{pending ? 'Saving…' : editing ? 'Save' : 'Create group'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
