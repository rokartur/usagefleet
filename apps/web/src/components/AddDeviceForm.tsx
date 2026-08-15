import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { CheckIcon, CopyIcon, PlusIcon } from 'lucide-react'
import { InstallCommand } from '@/components/InstallCommand'
import { Button } from '@/components/ui/button'
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { createDevice } from '@/lib/actions'

/** The one-time token step. The plaintext token is never retrievable again, so
 *  what the user copies is the install command with the token already in it —
 *  the raw token stays available underneath for manual setups. */
function TokenReveal({ token, deviceName }: { token: string; deviceName: string }) {
	const [copied, setCopied] = useState(false)
	return (
		<div className='flex flex-col gap-5'>
			<div className='flex flex-col gap-2'>
				<p className='text-sm font-medium'>1. Install and start the collector on {deviceName}</p>
				<InstallCommand token={token} />
				<FieldDescription>
					It installs the collector, starts it at login and reads your Claude login on that machine. Nothing
					to paste back here.
				</FieldDescription>
			</div>

			<div className='flex flex-col gap-2'>
				<p className='text-sm font-medium'>2. Confirm it found your Claude login</p>
				<code className='rounded-lg bg-muted p-3 font-mono text-xs'>usagefleet status</code>
				<FieldDescription>
					Then the dashboard fills in within a minute, and updates every five.
				</FieldDescription>
			</div>

			<details className='flex flex-col gap-2'>
				<summary className='cursor-pointer text-sm text-muted-foreground'>Raw token, for manual setup</summary>
				<div className='mt-2 flex items-start gap-2'>
					<code className='min-w-0 flex-1 rounded-lg bg-muted p-3 font-mono text-xs break-all'>{token}</code>
					<Button
						variant='outline'
						size='icon'
						aria-label='Copy token'
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(token)
								setCopied(true)
								toast.add({
									title: 'Token copied to clipboard',
									type: 'success',
								})
							} catch {
								toast.add({
									description: 'Select the token and copy it manually.',
									priority: 'high',
									title: "Couldn't copy token",
									type: 'error',
								})
							}
						}}
					>
						{copied ? <CheckIcon /> : <CopyIcon />}
					</Button>
				</div>
			</details>
		</div>
	)
}

export function AddDeviceForm({ groups, atCap }: { groups: { id: string; name: string }[]; atCap: boolean }) {
	const [open, setOpen] = useState(false)
	const router = useRouter()
	const [name, setName] = useState('')
	// Default to the first group so a new device is never left ungrouped.
	const [groupId, setGroupId] = useState(groups[0]?.id ?? '')
	const groupItems = groups.length
		? groups.map(g => ({ label: g.name, value: g.id }))
		: [{ label: 'Default (created automatically)', value: '' }]
	// Kept together so the token step can still name the device after the form
	// input is cleared.
	const [created, setCreated] = useState<{
		token: string
		name: string
	} | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault()
		setLoading(true)
		setError(null)
		try {
			const res = await toast.promise(createDevice({ data: { groupId: groupId || null, name } }), {
				error: {
					description: 'Please try again.',
					priority: 'high',
					title: 'Failed to create device',
				},
				loading: { title: 'Creating device…' },
				success: { title: 'Device created' },
			})
			setCreated({ name, token: res.token })
			setName('')
			// Refetch the device list so the new row (and the updated cap counter)
			// show up behind the dialog.
			await router.invalidate()
		} catch {
			setError('Failed to create device. Please try again.')
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
					setError(null)
				}
			}}
		>
			<DialogTrigger render={<Button disabled={atCap} />}>
				<PlusIcon />
				Add device
			</DialogTrigger>
			<DialogContent>
				{created ? (
					<>
						<DialogHeader>
							<DialogTitle>{created.name} is registered</DialogTitle>
							<DialogDescription>One command left. The token inside it is shown once.</DialogDescription>
						</DialogHeader>
						<TokenReveal token={created.token} deviceName={created.name} />
						<DialogFooter>
							<DialogClose render={<Button variant='outline' />}>Done</DialogClose>
						</DialogFooter>
					</>
				) : (
					<form onSubmit={onSubmit} className='grid gap-4'>
						<DialogHeader>
							<DialogTitle>Add device</DialogTitle>
							<DialogDescription>
								Creates an API token for one machine running the collector.
							</DialogDescription>
						</DialogHeader>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor='device-name'>Device name</FieldLabel>
								<Input
									id='device-name'
									required
									value={name}
									onChange={e => setName(e.target.value)}
									placeholder='e.g. work-macbook'
								/>
								<FieldDescription>
									Just a label, so you recognise the machine in these lists.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor='device-group'>Group</FieldLabel>
								{/* `items` is what lets the trigger show a group name rather
                    than the raw id it stores. */}
								<Select
									value={groupId}
									onValueChange={next => setGroupId(next ?? '')}
									items={groupItems}
								>
									<SelectTrigger id='device-group' className='w-full'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{groupItems.map(item => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FieldDescription>
									The group whose limit share this device counts against.
								</FieldDescription>
							</Field>
							{error && <FieldDescription className='text-destructive'>{error}</FieldDescription>}
						</FieldGroup>
						<DialogFooter>
							<DialogClose render={<Button variant='outline' type='button' />}>Cancel</DialogClose>
							<Button type='submit' disabled={loading}>
								{loading ? 'Creating…' : 'Create device'}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	)
}
