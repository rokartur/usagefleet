'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { motionTokens } from '../lib/motion-tokens'

export interface TooltipProps {
	content: ReactNode
	children: ReactElement
	side?: 'top' | 'bottom' | 'left' | 'right'
}

/** Mount once near the root: within 300ms of one tooltip closing, the next opens instantly and only fades (Base UI sets data-instant). */
export function TooltipProvider({ children }: { children: ReactNode }) {
	return (
		<TooltipPrimitive.Provider delay={250} timeout={300}>
			{children}
		</TooltipPrimitive.Provider>
	)
}

const lineWidth = 'max-w-[calc(15rem-2*var(--space-4)-2px)]'

/** String content crossfades when it changes while open, and the bubble springs to the new text size. */
function TooltipText({ text }: { text: string }) {
	const reduced = useReducedMotion()
	const measure = useRef<HTMLSpanElement>(null)
	const measured = useRef<string | null>(null)
	const [size, setSize] = useState<{ width: number; height: number; animate: boolean } | null>(null)
	useLayoutEffect(() => {
		const node = measure.current
		if (!node) {
			return
		}
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) {
				return
			}
			const box = entry.borderBoxSize?.[0]
			const current = node.textContent
			const animate = measured.current !== null && measured.current !== current
			measured.current = current
			setSize({
				width: Math.ceil(box?.inlineSize ?? node.offsetWidth),
				height: Math.ceil(box?.blockSize ?? node.offsetHeight),
				animate,
			})
		})
		observer.observe(node)
		return () => observer.disconnect()
	}, [])
	return (
		<motion.span
			className='relative block overflow-clip [overflow-clip-margin:var(--space-2)]'
			initial={false}
			animate={size ? { width: size.width, height: size.height } : undefined}
			transition={size?.animate && !reduced ? motionTokens.spring.morph : { duration: 0 }}
		>
			<span
				ref={measure}
				className={`pointer-events-none invisible absolute top-0 left-0 w-max ${lineWidth}`}
				aria-hidden='true'
			>
				{text}
			</span>
			<AnimatePresence mode='popLayout' initial={false}>
				<motion.span
					key={text}
					className={`block w-max ${lineWidth}`}
					initial={reduced ? false : { opacity: 0, y: '0.3em', filter: `blur(${motionTokens.blur.soft}px)` }}
					animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
					exit={
						reduced
							? { opacity: 0, transition: { duration: 0 } }
							: {
									opacity: 0,
									y: '-0.3em',
									filter: `blur(${motionTokens.blur.subtle}px)`,
									transition: {
										duration: motionTokens.duration.instant,
										ease: [...motionTokens.ease.standard],
									},
								}
					}
					transition={{ duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}
				>
					{text}
				</motion.span>
			</AnimatePresence>
		</motion.span>
	)
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger render={children} />
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Positioner className='z-90' side={side} sideOffset={8} collisionPadding={12}>
					{/* The first tooltip rises a few pixels from its trigger; inside the skip window the next one only fades.
            Transitions, not keyframes, so returning to the trigger mid-exit reverses the fade instead of restarting it. */}
					<TooltipPrimitive.Popup className='max-w-60 origin-(--transform-origin) rounded-(--radius-control) border border-[color-mix(in_oklab,var(--background)_14%,var(--foreground))] bg-(--foreground) px-4 py-3 text-sm leading-(--leading-body) font-normal text-(--background) shadow-(--shadow-raised) transition-[opacity,translate,scale] duration-(--duration-fast) ease-(--ease-enter) [--tooltip-y:3px] data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:duration-(--duration-instant) data-ending-style:ease-(--ease-standard) data-instant:duration-(--duration-instant) data-instant:ease-(--ease-standard) data-starting-style:translate-y-(--tooltip-y) data-starting-style:scale-97 data-starting-style:opacity-0 data-instant:data-starting-style:translate-y-0 data-instant:data-starting-style:scale-100 data-[side=bottom]:[--tooltip-y:-3px] motion-reduce:transition-opacity motion-reduce:duration-(--duration-instant)'>
						{typeof content === 'string' || typeof content === 'number' ? (
							<TooltipText text={String(content)} />
						) : (
							content
						)}
					</TooltipPrimitive.Popup>
				</TooltipPrimitive.Positioner>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	)
}

export default Tooltip
