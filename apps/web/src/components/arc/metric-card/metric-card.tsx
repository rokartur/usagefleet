'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'
import { AnimatedCounter } from '../animated-counter/animated-counter'
import { motionTokens } from '../lib/motion-tokens'

export interface MetricCardProps {
	label: string
	value: number
	prefix?: string
	decimals?: number
	context: string
}

/** Copy that holds a number enters from the side it moved toward: a larger value rises from below, a smaller one drops from above. */
const rise: Variants = {
	gone: (direction: number) => ({
		filter: `blur(${motionTokens.blur.subtle}px)`,
		opacity: 0,
		transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] },
		y: `${-0.3 * direction}em`,
	}),
	hidden: (direction: number) => ({
		filter: `blur(${motionTokens.blur.soft}px)`,
		opacity: 0,
		y: `${0.3 * direction}em`,
	}),
	shown: {
		filter: 'blur(0px)',
		opacity: 1,
		transition: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] },
		y: 0,
	},
}
const fade: Variants = {
	gone: { opacity: 0, transition: { duration: motionTokens.duration.instant } },
	hidden: { opacity: 0 },
	shown: { opacity: 1, transition: { duration: motionTokens.duration.instant } },
}
const amountIn = (text: string) => Number(text.replaceAll(',', '').match(/-?\d+(?:\.\d+)?/)?.[0] ?? Number.NaN)

/** New copy rises in while the old copy leaves; the outgoing copy pops out of flow so the line never holds both. */
function Swap({ text }: { text: string }) {
	const reduceMotion = !!useReducedMotion()
	const [shown, setShown] = useState({ direction: 1, text })
	if (shown.text !== text) {
		setShown({ direction: amountIn(text) < amountIn(shown.text) ? -1 : 1, text })
	}
	return (
		<span className='relative block max-w-full'>
			<AnimatePresence mode='popLayout' initial={false} custom={shown.direction}>
				<motion.span
					key={text}
					className='block'
					custom={shown.direction}
					variants={reduceMotion ? fade : rise}
					initial='hidden'
					animate='shown'
					exit='gone'
				>
					{text}
				</motion.span>
			</AnimatePresence>
		</span>
	)
}

export function MetricCard({ label, value, prefix, decimals, context }: MetricCardProps) {
	return (
		<article className='min-w-0 rounded-(--radius-surface) border bg-(--surface) p-(--space-6) shadow-(--shadow-resting) max-[380px]:p-(--space-4)'>
			<h2 className='mb-(--space-8) text-sm font-normal text-(--text-secondary) max-[380px]:mb-(--space-6)'>
				<Swap text={label} />
			</h2>
			<AnimatedCounter value={value} prefix={prefix} decimals={decimals} animateOnView />
			<p className='mt-(--space-4) text-sm leading-(--leading-body) text-(--text-muted)'>
				<Swap text={context} />
			</p>
		</article>
	)
}

export default MetricCard
