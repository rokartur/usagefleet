import { useEffect, useRef, useState } from 'react'
import { Ban } from 'lucide-react'
import { ActionForm } from '@/components/ActionForm'
import { ConfirmAction } from '@/components/ConfirmAction'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { assignDeviceGroup, revokeDevice, setDeviceBlocking } from '@/lib/actions'

/** Moves a device between groups on change — no separate Save button. */
export function DeviceGroupSelect({
	deviceId,
	deviceName,
	groupId,
	groups,
}: {
	deviceId: string
	deviceName: string
	groupId: string | null
	groups: { id: string; name: string }[]
}) {
	const form = useRef<HTMLFormElement>(null)
	const [selected, setSelected] = useState(groupId ?? '')
	const items = groups.map(g => ({ label: g.name, value: g.id }))

	// Submit once the pick has landed in the select's hidden input: during
	// onValueChange the form still holds the previous group.
	useEffect(() => {
		if (selected !== (groupId ?? '')) {
			form.current?.requestSubmit()
		}
	}, [selected, groupId])

	return (
		<ActionForm
			ref={form}
			action={assignDeviceGroup}
			loadingMessage={`Moving ${deviceName}…`}
			successMessage={`${deviceName} moved`}
			errorMessage={`Couldn't move ${deviceName}. Please try again.`}
		>
			<input type='hidden' name='deviceId' value={deviceId} />
			<Select name='groupId' value={selected} onValueChange={next => setSelected(next ?? '')} items={items}>
				<SelectTrigger size='sm' aria-label={`Group for ${deviceName}`}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{items.map(item => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</ActionForm>
	)
}

/** Per-device guard kill switch: off = `usagefleet guard` never refuses a
 *  prompt on this machine, even when its group's blocking switches are on. */
export function DeviceBlockingToggle({
	deviceId,
	deviceName,
	enabled,
}: {
	deviceId: string
	deviceName: string
	enabled: boolean
}) {
	const form = useRef<HTMLFormElement>(null)
	const [checked, setChecked] = useState(enabled)

	// Submit after the state lands in the hidden input, same as the group select.
	useEffect(() => {
		if (checked !== enabled) {
			form.current?.requestSubmit()
		}
	}, [checked, enabled])

	return (
		<ActionForm
			ref={form}
			action={setDeviceBlocking}
			loadingMessage={`Updating ${deviceName}…`}
			successMessage={checked ? `${deviceName} can be blocked` : `${deviceName} exempt from blocking`}
			errorMessage={`Couldn't update ${deviceName}. Please try again.`}
		>
			<input type='hidden' name='deviceId' value={deviceId} />
			{checked && <input type='hidden' name='enabled' value='on' />}
			{/* The switch carries its own accessible name; the text is a visual cue. */}
			<span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
				blocking
				<Switch
					size='sm'
					checked={checked}
					onCheckedChange={setChecked}
					aria-label={`Blocking for ${deviceName}`}
				/>
			</span>
		</ActionForm>
	)
}

/** The only exit for a device: revoking is one-way and rows are never deleted. */
export function RevokeDeviceButton({ id, name }: { id: string; name: string }) {
	return (
		<ConfirmAction
			action={revokeDevice}
			id={id}
			title={`Revoke ${name}?`}
			description='Its token stops working immediately and the collector on that machine can no longer report usage. Past usage is kept.'
			confirmLabel='Revoke'
			successMessage={`${name} revoked`}
		>
			<Ban />
			Revoke
		</ConfirmAction>
	)
}
