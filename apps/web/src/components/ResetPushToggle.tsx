import { useEffect, useState } from 'react'
import { useTranslations } from 'use-intl'
import { Switch } from '@/components/arc/switch/switch'
import { useToast } from '@/components/arc/toast-stack/toast-stack'
import { deletePushSubscription, savePushSubscription } from '@/lib/actions'

type PushState = 'loading' | 'unsupported' | 'blocked' | 'off' | 'on'

const WORKER = '/sw.js'

/** Reset pushes for this browser. The browser's own subscription is the source of truth,
 *  so the switch reads it rather than asking the server. */
export function ResetPushToggle({ publicKey }: { publicKey: string }) {
	const t = useTranslations('dash.resetPush')
	const toast = useToast()
	const [state, setState] = useState<PushState>('loading')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
			setState('unsupported')
			return
		}
		if (Notification.permission === 'denied') {
			setState('blocked')
			return
		}
		void currentSubscription().then(sub => setState(sub ? 'on' : 'off'))
	}, [])

	async function toggle(on: boolean) {
		setBusy(true)
		try {
			setState(on ? await subscribe(publicKey) : await unsubscribe())
		} catch (error) {
			toast.add({ description: (error as Error).message, title: t('failed'), type: 'error' })
		} finally {
			setBusy(false)
		}
	}

	if (state === 'unsupported' || state === 'blocked') {
		return <p className='text-sm text-muted-foreground'>{t(state)}</p>
	}
	return (
		<Switch
			label={t('label')}
			checked={state === 'on'}
			disabled={state === 'loading' || busy}
			onCheckedChange={toggle}
		/>
	)
}

async function currentSubscription() {
	const registration = await navigator.serviceWorker.getRegistration(WORKER)
	return (await registration?.pushManager.getSubscription()) ?? null
}

async function subscribe(publicKey: string): Promise<PushState> {
	const permission = await Notification.requestPermission()
	if (permission !== 'granted') {
		return permission === 'denied' ? 'blocked' : 'off'
	}
	await navigator.serviceWorker.register(WORKER)
	const registration = await navigator.serviceWorker.ready
	const sub = await registration.pushManager.subscribe({
		applicationServerKey: publicKey,
		userVisibleOnly: true,
	})
	const { endpoint, keys } = sub.toJSON()
	try {
		await savePushSubscription({ data: { endpoint, keys } })
	} catch (error) {
		// A browser subscription the server never stored would show the switch on and push nothing.
		await sub.unsubscribe()
		throw error
	}
	return 'on'
}

async function unsubscribe(): Promise<PushState> {
	const sub = await currentSubscription()
	if (sub) {
		await deletePushSubscription({ data: { endpoint: sub.endpoint } })
		await sub.unsubscribe()
	}
	return 'off'
}
