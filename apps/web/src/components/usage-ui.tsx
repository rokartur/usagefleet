import { useEffect, useRef } from 'react'
import { EyeIcon } from 'lucide-react'
import { animate, useReducedMotion } from 'motion/react'
import { useTranslations } from 'use-intl'
import { Progress } from '@/components/arc/progress/progress'
import { formatPctNumber, roundTenth } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * A number that counts to its new value instead of jumping, so a background
 * refresh reads as movement rather than a silent swap. Text is written straight
 * to the node during the tween: React re-rendering per frame would be a whole
 * dashboard re-render per frame.
 *
 * Renders the formatted value on the server, animates only when it actually
 * changes, and honours prefers-reduced-motion.
 */
export function Num({
	value,
	format = String,
	className,
}: {
	value: number
	format?: (n: number) => string
	className?: string
}) {
	const ref = useRef<HTMLSpanElement>(null)
	/** Last value asked for, vs. what is actually painted right now: a value that
	 *  changes mid-tween has to carry on from the visible number, not jump. */
	const target = useRef(value)
	const painted = useRef(value)
	// Held in a ref so an inline formatter's identity can't retrigger the tween
	// effect and cut a running count short.
	const formatRef = useRef(format)
	const reduced = useReducedMotion()

	useEffect(() => {
		formatRef.current = format
	})

	useEffect(() => {
		const el = ref.current
		if (!el || target.current === value) {
			return
		}
		const from = painted.current
		target.current = value
		if (reduced) {
			painted.current = value
			el.textContent = formatRef.current(value)
			return
		}
		const controls = animate(from, value, {
			duration: 0.6,
			ease: [0.22, 1, 0.36, 1],
			onUpdate: v => {
				painted.current = v
				el.textContent = formatRef.current(v)
			},
		})
		return () => controls.stop()
	}, [value, reduced])

	return (
		<span ref={ref} className={cn('tabular-nums', className)}>
			{format(value)}
		</span>
	)
}

/** A dashboard panel: Arc's surface, a title, controls on the right. */
export function Section({
	title,
	actions,
	children,
}: {
	title: string
	actions?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<section className='min-w-0 rounded-(--radius-surface) border bg-surface p-6'>
			<div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
				<h2 className='text-sm font-medium'>{title}</h2>
				{actions}
			</div>
			<div className='mt-4'>{children}</div>
		</section>
	)
}

/** Percentages are shown uncapped while the bar stops at full, so the number is
 *  what carries an overrun: paint it destructive once it reads 100%. Rounded
 *  like the printed value, so "100.0%" is never white. */
export const overrun = (pct: number) => (roundTenth(pct) >= 100 ? 'text-destructive' : undefined)

/** A group's bar takes the group's colour. No threshold colours: amber and red
 *  mean offline and overrun elsewhere, so nearness reads from the length and an
 *  overrun from the number beside it ({@link overrun}). */
export function UsageBar({ pct, color, className }: { pct: number; color?: string; className?: string }) {
	const t = useTranslations('dash.usage')
	const value = Math.min(100, Math.max(0, pct))
	return (
		<Progress
			value={value}
			color={color ?? 'var(--accent)'}
			aria-label={t('barLabel', { pct: formatPctNumber(value) })}
			className={className}
		/>
	)
}

/** Next to a group name: that group's percentage is of the whole account, not a slice. */
export function WatchOnlyMark() {
	const t = useTranslations('dash.groups')
	return (
		<span className='inline-flex shrink-0 text-muted-foreground'>
			<EyeIcon className='size-3' aria-hidden />
			<span className='sr-only'>{t('watchOnly')}</span>
		</span>
	)
}
