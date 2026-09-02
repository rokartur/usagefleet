import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'use-intl'
import { useMounted } from '@/hooks/use-mounted'

/** "3d 4h 5m" of remaining time, or '' when there is nothing to count down to.
 *  The d/h/m/s suffixes are left untranslated: they are unit symbols, and every
 *  locale we ship reads them the same way in a dense number column. */
function remaining(resetsAt: string | null): string | null {
	if (!resetsAt) {
		return null
	}
	const target = new Date(resetsAt).getTime()
	if (Number.isNaN(target)) {
		return null
	}
	let secs = Math.round((target - Date.now()) / 1000)
	if (secs <= 0) {
		return ''
	}
	const days = Math.floor(secs / 86_400)
	secs -= days * 86_400
	const hours = Math.floor(secs / 3600)
	secs -= hours * 3600
	const mins = Math.floor(secs / 60)
	secs -= mins * 60
	const parts: string[] = []
	if (days) {
		parts.push(`${days}d`)
	}
	if (hours) {
		parts.push(`${hours}h`)
	}
	parts.push(`${mins}m`)
	if (!days && !hours) {
		parts.push(`${secs}s`)
	} // tick by seconds when close
	return parts.join(' ')
}

/** The absolute reset time in the viewer's local timezone (e.g. "04:50"),
 *  prefixed with the weekday once it is more than a day out. */
function clockLabel(resetsAt: string | null, locale: string): string | null {
	if (!resetsAt) {
		return null
	}
	const d = new Date(resetsAt)
	if (Number.isNaN(d.getTime())) {
		return null
	}
	const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
	const moreThanADay = d.getTime() - Date.now() > 24 * 60 * 60 * 1000
	const day = moreThanADay ? `${d.toLocaleDateString(locale, { weekday: 'short' })} ` : ''
	return `${day}${time}`
}

export function ResetCountdown({ resetsAt }: { resetsAt: string | null }) {
	// Single state bumped each second; both labels recompute from `resetsAt` and
	// the current time, so the weekday prefix stays correct across the 24h boundary.
	const [, setTick] = useState(0)
	const locale = useLocale()
	const t = useTranslations('dash.reset')
	// Both labels read the wall clock, and one of them the viewer's timezone.
	// Neither survives being rendered on the server, so this stays empty until the
	// client owns the tree.
	const mounted = useMounted()

	useEffect(() => {
		const id = setInterval(() => setTick(t => t + 1), 1000)
		return () => clearInterval(id)
	}, [])

	const left = mounted ? remaining(resetsAt) : null
	if (left === null) {
		return null
	}
	const clock = clockLabel(resetsAt, locale)
	return (
		<span>
			{left === '' ? t('resetting') : t('resetsIn', { left })}
			{clock && <span className='text-neutral-500'>{t('at', { clock })}</span>}
		</span>
	)
}
