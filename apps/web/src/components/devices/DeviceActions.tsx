import { useEffect, useRef, useState } from 'react'
import { Ban } from 'lucide-react'
import { useTranslations } from 'use-intl'
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
	const t = useTranslations('dash.devices')
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
			loadingMessage={t('moving', { name: deviceName })}
			successMessage={t('moved', { name: deviceName })}
			errorMessage={t('moveFailed', { name: deviceName })}
		>
			<input type='hidden' name='deviceId' value={deviceId} />
			<Select name='groupId' value={selected} onValueChange={next => setSelected(next ?? '')} items={items}>
				<SelectTrigger size='sm' aria-label={t('groupLabel', { name: deviceName })}>
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
	const t = useTranslations('dash.devices')
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
			loadingMessage={t('updating', { name: deviceName })}
			successMessage={t(checked ? 'canBeBlocked' : 'notBlocked', { name: deviceName })}
			errorMessage={t('updateFailed', { name: deviceName })}
		>
			<input type='hidden' name='deviceId' value={deviceId} />
			{checked && <input type='hidden' name='enabled' value='on' />}
			{/* The switch carries its own accessible name; the text is a visual cue. */}
			<span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
				{t('blocking')}
				<Switch
					size='sm'
					checked={checked}
					onCheckedChange={setChecked}
					aria-label={t('blockingLabel', { name: deviceName })}
				/>
			</span>
		</ActionForm>
	)
}

/** The only exit for a device: revoking is one-way and rows are never deleted. */
export function RevokeDeviceButton({ id, name }: { id: string; name: string }) {
	const t = useTranslations('dash.devices')
	return (
		<ConfirmAction
			action={revokeDevice}
			id={id}
			title={t('revokeTitle', { name })}
			description={t('revokeDescription')}
			confirmLabel={t('revoke')}
			successMessage={t('revokedDevice', { name })}
		>
			<Ban />
			{t('revoke')}
		</ConfirmAction>
	)
}
