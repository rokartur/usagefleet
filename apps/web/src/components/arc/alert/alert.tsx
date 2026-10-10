'use client'

import type { HTMLAttributes } from 'react'
import { Check, CircleX, Info, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import type { HTMLMotionProps, TargetAndTransition, Transition } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

const styles = {
	alert: 'flex items-start gap-3 rounded-(--radius-control) border bg-(--surface) p-4 text-left shadow-(--shadow-resting)',
	icon: 'relative mt-px grid size-[18px] flex-none place-items-center [&_svg]:block',
	glyph: 'relative grid flex-none place-items-center',
	title: 'relative block min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]',
}

const toneColor = {
	danger: 'text-(--danger)',
	info: 'text-(--accent)',
	success: 'text-(--success)',
	warning: 'text-(--warning)',
}

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
	tone?: AlertTone
	title: string
}

const icons = { danger: CircleX, info: Info, success: Check, warning: TriangleAlert }
const exitFast: Transition = { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] }
const textIn: TargetAndTransition = { opacity: 0, y: '0.3em', filter: `blur(${motionTokens.blur.soft}px)` }
const textOut: TargetAndTransition = {
	opacity: 0,
	y: '-0.3em',
	filter: `blur(${motionTokens.blur.subtle}px)`,
	transition: exitFast,
}
const iconIn: TargetAndTransition = { opacity: 0, scale: 0.6, filter: `blur(${motionTokens.blur.subtle}px)` }
const shown: TargetAndTransition = { opacity: 1, y: '0em', scale: 1, filter: 'blur(0px)' }
const fadeOut: TargetAndTransition = { opacity: 0, transition: { duration: motionTokens.duration.instant } }

/** Outgoing copies are hidden from assistive tech while they fade, so the live region reads only the current text. */
function Swap(props: HTMLMotionProps<'span'>) {
	const present = useIsPresent()
	return <motion.span {...props} aria-hidden={present ? props['aria-hidden'] : true} />
}

/** A new message rises in over the old one, and a new tone morphs its icon in place. Danger interrupts screen readers; the rest wait. */
export function Alert({ tone = 'info', title, className, ...props }: AlertProps) {
	const reduce = useReducedMotion()
	const Icon = icons[tone]
	const enter: Transition = reduce
		? { duration: motionTokens.duration.instant }
		: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }
	return (
		<div {...props} className={cn(styles.alert, className)} role={tone === 'danger' ? 'alert' : 'status'}>
			<span className={cn(styles.icon, toneColor[tone])}>
				<AnimatePresence mode='popLayout' initial={false}>
					<Swap
						key={tone}
						className={styles.glyph}
						initial={reduce ? { opacity: 0 } : iconIn}
						animate={shown}
						exit={reduce ? fadeOut : { ...iconIn, transition: exitFast }}
						transition={reduce ? enter : motionTokens.spring.snappy}
					>
						<Icon size={18} aria-hidden='true' />
					</Swap>
				</AnimatePresence>
			</span>
			<strong className={styles.title}>
				<AnimatePresence mode='popLayout' initial={false}>
					<Swap
						key={title}
						className='block'
						initial={reduce ? { opacity: 0 } : textIn}
						animate={shown}
						exit={reduce ? fadeOut : textOut}
						transition={enter}
					>
						{title}
					</Swap>
				</AnimatePresence>
			</strong>
		</div>
	)
}

export default Alert
