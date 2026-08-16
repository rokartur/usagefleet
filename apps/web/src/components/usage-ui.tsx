import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { Progress } from '@/components/ui/progress'
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

/** A dashboard section: hairline rule, small label, controls on the right. Used
 *  instead of Card so the page reads as one continuous sheet of numbers. */
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
		<section className='border-t pt-4'>
			<div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
				<h2 className='text-[11px] font-medium tracking-wider text-muted-foreground uppercase'>{title}</h2>
				{actions}
			</div>
			<div className='mt-3'>{children}</div>
		</section>
	)
}

/** A limit bar: neutral up to 70%, amber past it, destructive past 90% — so a
 *  group that is about to eat its budget is visible without reading numbers. */
export function UsageBar({ pct, className }: { pct: number; className?: string }) {
	const value = Math.min(100, Math.max(0, pct))
	return (
		<Progress
			value={value}
			aria-label={`${value}% used`}
			className={cn(
				'[&_[data-slot=progress-track]]:h-1.5',
				pct >= 90 && '[&_[data-slot=progress-indicator]]:bg-destructive',
				pct >= 70 && pct < 90 && '[&_[data-slot=progress-indicator]]:bg-amber-500',
				className,
			)}
		/>
	)
}
