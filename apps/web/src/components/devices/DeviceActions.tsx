import { useEffect, useRef, useState } from 'react'
import { Ban } from 'lucide-react'
import { ActionForm } from '@/components/ActionForm'
import { ConfirmAction } from '@/components/ConfirmAction'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { assignDeviceGroup, revokeDevice } from '@/lib/actions'

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
