'use client'

import { useEffect, useState } from 'react'
import { CircleAlert, Copy } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { TargetAndTransition, Transition } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

const styles = {
	button: 'inline-flex size-(--control-height-sm) flex-none cursor-pointer items-center justify-center rounded-(--radius-control) border bg-(--surface) text-(--foreground) [-webkit-tap-highlight-color:transparent] [transition:background-color_var(--duration-fast)_var(--ease-standard),border-color_var(--duration-fast)_var(--ease-standard),color_var(--duration-fast)_var(--ease-standard),scale_var(--duration-spring)_var(--ease-spring)] not-disabled:hover:border-(--border-strong) not-disabled:hover:bg-(--surface-muted) not-disabled:active:scale-96 not-disabled:active:[transition-duration:var(--duration-fast),var(--duration-fast),var(--duration-fast),var(--duration-instant)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100',
	plain: 'border-transparent bg-transparent text-(--text-secondary) not-disabled:hover:border-transparent not-disabled:hover:text-(--foreground)',
	icon: 'relative grid size-4 flex-none',
	iconInner:
		'absolute inset-0 grid place-items-center data-[state=copied]:text-(--success) data-[state=error]:text-(--danger)',
}

type CopyState = 'idle' | 'copied' | 'error'

export interface CopyButtonMessages {
	copied: string
	failed: string
}

export interface CopyButtonProps {
	value: string
	/** Spoken name of the button, e.g. "Copy token". */
	label: string
	variant?: 'outline' | 'plain'
	messages?: Partial<CopyButtonMessages>
	className?: string
}

const defaultMessages: CopyButtonMessages = { copied: 'Copied', failed: 'Could not copy' }

/** Copy feedback is deliberately unhurried: a slow, almost critically damped spring and long, soft crossfades read as calm. */
const settle = { type: 'spring', visualDuration: 0.5, bounce: 0.06 } as const
const enter: Transition = { duration: 0.36, ease: [...motionTokens.ease.enter] }
const instant: Transition = { duration: motionTokens.duration.instant }
const soft = `blur(${motionTokens.blur.soft}px)`
const rest: TargetAndTransition = { opacity: 1, scale: 1, filter: 'blur(0px)' }
const fadeIn: TargetAndTransition = { ...rest, opacity: 0 }
const fadeOut: TargetAndTransition = { opacity: 0, transition: instant }
/** The old glyph shrinks into a blur while the new one grows out of it on the slow spring. */
const iconIn: TargetAndTransition = { opacity: 0, scale: 0.6, filter: soft }
const iconOut: TargetAndTransition = {
	opacity: 0,
	scale: 0.6,
	filter: soft,
	transition: { duration: 0.24, ease: [...motionTokens.ease.standard] },
}
const iconEnter: Transition = { scale: settle, opacity: { ...enter, delay: 0.03 }, filter: { ...enter, delay: 0.03 } }

/** The success tick draws itself from its short stroke, the way a hand would write it. */
function DrawnCheck({ reduced }: { reduced: boolean }) {
	return (
		<svg
			width={16}
			height={16}
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth={1.75}
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<motion.path
				d='M4 12l5 5L20 6'
				initial={reduced ? false : { pathLength: 0, opacity: 0 }}
				animate={{ pathLength: 1, opacity: 1 }}
				transition={{
					pathLength: { duration: 0.5, ease: [...motionTokens.ease.standard], delay: 0.05 },
					opacity: { duration: 0.01, delay: 0.05 },
				}}
			/>
		</svg>
	)
}

/** Holds "copied" or "error" for a moment, then hands back to idle. The timer is cleared on unmount. */
function useCopyFeedback(duration = 1900) {
	const [state, setState] = useState<CopyState>('idle')
	useEffect(() => {
		if (state === 'idle') {
			return
		}
		const timer = setTimeout(() => setState('idle'), duration)
		return () => clearTimeout(timer)
	}, [state, duration])
	async function copy(value: string) {
		try {
			await navigator.clipboard.writeText(value)
			setState('copied')
		} catch {
			// Clipboard denied or insecure origin: the button shows the failure and the text stays selectable.
			setState('error')
		}
	}
	return { state, copy }
}

export function CopyButton({ value, label, variant = 'outline', messages: messagesProp, className }: CopyButtonProps) {
	const messages = { ...defaultMessages, ...messagesProp }
	const { state, copy } = useCopyFeedback()
	const reduced = useReducedMotion() ?? false
	return (
		<>
			<button
				type='button'
				className={cn(styles.button, variant === 'plain' && styles.plain, className)}
				onClick={() => copy(value)}
				aria-label={label}
			>
				<span className={styles.icon} aria-hidden='true'>
					<AnimatePresence initial={false}>
						<motion.span
							key={state}
							className={styles.iconInner}
							data-state={state}
							initial={reduced ? fadeIn : iconIn}
							animate={rest}
							exit={reduced ? fadeOut : iconOut}
							transition={reduced ? instant : iconEnter}
						>
							{state === 'copied' ? (
								<DrawnCheck reduced={reduced} />
							) : state === 'error' ? (
								<CircleAlert size={16} strokeWidth={1.75} />
							) : (
								<Copy size={16} strokeWidth={1.75} />
							)}
						</motion.span>
					</AnimatePresence>
				</span>
			</button>
			<span className='sr-only' role='status' aria-live='polite'>
				{state === 'idle' ? '' : `${label}: ${state === 'copied' ? messages.copied : messages.failed}`}
			</span>
		</>
	)
}

export default CopyButton
