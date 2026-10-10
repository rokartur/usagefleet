'use client'

import { isValidElement, useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Folder } from 'lucide-react'
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useReducedMotion } from 'motion/react'
import type {
	AnimationPlaybackControls,
	HTMLMotionProps,
	MotionProps,
	TargetAndTransition,
	Transition,
} from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

const styles = {
	root: 'flex w-full flex-col items-center px-5 py-[clamp(var(--space-8),8vw,var(--space-12))] text-center',
	icon: 'relative grid size-12 place-items-center rounded-(--radius-panel) border bg-(--surface-muted) text-(--text-secondary) animate-[empty-state-icon_var(--duration-considered)_var(--ease-enter)_both] motion-reduce:animate-none',
	glyph: 'grid place-items-center',
	frame: 'w-full max-w-full',
	copy: 'flow-root',
	title: 'relative mt-5 text-base font-medium leading-(--leading-body) text-(--foreground)',
	description: 'relative mx-auto mt-2 max-w-72 text-sm leading-(--leading-body) text-(--text-secondary)',
	// Centered copy wraps into even lines, so a new description never leaves a single word hanging.
	line: 'block text-balance',
	action: 'mt-5 flex flex-wrap justify-center gap-3',
}

export interface EmptyStateProps {
	title: string
	description: string
	action?: ReactNode
	icon?: ReactNode
	className?: string
	/** Optional accessible label for the state region. */
	label?: string
}

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

/** Outgoing copies are hidden from assistive tech while they fade. */
function Swap(props: HTMLMotionProps<'span'>) {
	const present = useIsPresent()
	return <motion.span {...props} aria-hidden={present ? props['aria-hidden'] : true} />
}

/** A new icon component crossfades in; re-rendering the same icon stays still. */
function iconKey(icon: ReactNode) {
	if (!isValidElement(icon)) {
		return 'icon'
	}
	const type = icon.type as string | { displayName?: string; name?: string }
	return typeof type === 'string' ? type : (type.displayName ?? type.name ?? 'icon')
}

/** Follows its content height. After `morphKey` changes, the height springs from the old size to the new one and then returns to auto, so passive reflows (a resize, a font swap) follow instantly. It clips only while moving, so focus rings stay visible at rest. */
function HeightFrame({
	reduce,
	morphKey,
	children,
}: {
	reduce: boolean | null
	morphKey: string
	children: ReactNode
}) {
	const frame = useRef<HTMLDivElement>(null)
	const content = useRef<HTMLDivElement>(null)
	const height = useMotionValue<number | 'auto'>('auto')
	const changedAt = useRef(0)
	useLayoutEffect(() => {
		changedAt.current = performance.now()
	}, [morphKey])
	useEffect(() => {
		const node = content.current
		if (!node || typeof ResizeObserver === 'undefined') {
			return
		}
		let last: number | undefined
		let controls: AnimationPlaybackControls | undefined
		const settle = () => {
			height.jump('auto')
			if (frame.current) {
				Object.assign(frame.current.style, { overflow: '', height: 'auto' })
			}
		}
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) {
				return
			}
			const next = entry.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight
			const current = height.get()
			const from = typeof current === 'number' ? current : last
			last = next
			controls?.stop()
			if (reduce || from === undefined || from === next || performance.now() - changedAt.current > 120) {
				return settle()
			}
			// Pin the old height before this frame paints, then spring to the new one.
			if (frame.current) {
				Object.assign(frame.current.style, { overflow: 'hidden', height: `${from}px` })
			}
			controls = animate(height, [from, next], { ...motionTokens.spring.smooth, onComplete: settle })
		})
		observer.observe(node)
		return () => {
			observer.disconnect()
			controls?.stop()
		}
	}, [height, reduce])
	return (
		<motion.div ref={frame} className={styles.frame} style={{ height }}>
			<div ref={content} className={styles.copy}>
				{children}
			</div>
		</motion.div>
	)
}

export function EmptyState({ title, description, action, icon, className, label }: EmptyStateProps) {
	const reduce = useReducedMotion()
	const glyph = icon ?? <Folder width={24} height={24} strokeWidth={1.5} />
	const enter: Transition = reduce
		? { duration: motionTokens.duration.instant }
		: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }
	const swap: MotionProps = {
		initial: reduce ? { opacity: 0 } : textIn,
		animate: shown,
		exit: reduce ? fadeOut : textOut,
		transition: enter,
	}
	// The result of an action morphs in place: the icon crossfades and the copy rises in while the old copy leaves.
	return (
		<section className={cn(styles.root, className)} aria-label={label}>
			<div className={styles.icon} aria-hidden='true'>
				<AnimatePresence mode='popLayout' initial={false}>
					<Swap
						key={iconKey(glyph)}
						className={styles.glyph}
						initial={reduce ? { opacity: 0 } : iconIn}
						animate={shown}
						exit={reduce ? fadeOut : { ...iconIn, transition: exitFast }}
						transition={reduce ? enter : motionTokens.spring.snappy}
					>
						{glyph}
					</Swap>
				</AnimatePresence>
			</div>
			<HeightFrame reduce={reduce} morphKey={`${title}\n${description}`}>
				<h3 className={styles.title}>
					<AnimatePresence mode='popLayout' initial={false}>
						<Swap key={title} className={styles.line} {...swap}>
							{title}
						</Swap>
					</AnimatePresence>
				</h3>
				<p className={styles.description}>
					<AnimatePresence mode='popLayout' initial={false}>
						<Swap key={description} className={styles.line} {...swap}>
							{description}
						</Swap>
					</AnimatePresence>
				</p>
			</HeightFrame>
			{action && <div className={styles.action}>{action}</div>}
		</section>
	)
}

export default EmptyState
