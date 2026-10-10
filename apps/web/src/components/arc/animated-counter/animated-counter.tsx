'use client'

import { useEffect, useRef, useState } from 'react'
import {
	AnimatePresence,
	animate,
	motion,
	useInView,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from 'motion/react'
import type { MotionValue } from 'motion/react'
import { motionTokens } from '../lib/motion-tokens'

export interface AnimatedCounterProps {
	value: number
	prefix?: string
	suffix?: string
	decimals?: number
	/** Roll every digit up from zero the first time the counter scrolls into view. */
	animateOnView?: boolean
	/** Formatting locale. Fixed by default so server and client render the same digits. */
	locale?: string
}

type Part = { key: string; digit: number; order: number } | { key: string; text: string }

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const reveal = { ...motionTokens.spring.smooth, visualDuration: motionTokens.duration.considered }
const presence = {
	initial: { width: 0, opacity: 0 },
	animate: { width: 'auto', opacity: 1 },
	exit: { width: 0, opacity: 0 },
}

/** Split a formatted number into columns keyed by place value, so 999 → 1,000 keeps the ones column the ones column. */
function partsFor(value: number, decimals: number, locale: string): Part[] {
	const parts = new Intl.NumberFormat(locale, {
		maximumFractionDigits: decimals,
		minimumFractionDigits: decimals,
		numberingSystem: 'latn',
	}).formatToParts(value)
	let place = 0
	for (const part of parts) {
		if (part.type === 'integer') {
			place += part.value.length
		}
	}
	let fraction = 0
	let order = 0
	return parts.flatMap((part, index): Part[] => {
		if (part.type === 'integer') {
			return [...part.value].map(char => ({ digit: Number(char), key: `i${--place}`, order: order++ }))
		}
		if (part.type === 'fraction') {
			return [...part.value].map(char => ({ digit: Number(char), key: `f${fraction++}`, order: order++ }))
		}
		const key = part.type === 'group' ? `g${place}` : part.type === 'decimal' ? 'd' : `${part.type}${index}`
		return [{ key, text: part.value }]
	})
}

/** One digit on the wheel. Its offset from the wheel position decides where it sits and how visible it is. */
function Glyph({ position, digit }: { position: MotionValue<number>; digit: number }) {
	const offset = useTransform(position, current => ((((digit - current) % 10) + 15) % 10) - 5)
	const y = useTransform(offset, current => `${current}em`)
	const opacity = useTransform(offset, current => Math.max(0, 1 - Math.abs(current)))
	const visibility = useTransform(offset, current => (Math.abs(current) >= 1 ? 'hidden' : 'visible'))
	const filter = useTransform(offset, current =>
		Math.abs(current) < 0.02 || Math.abs(current) >= 1
			? 'none'
			: `blur(${(Math.abs(current) * motionTokens.blur.subtle).toFixed(2)}px)`,
	)
	return (
		<motion.span
			className='absolute inset-x-0 inset-y-(--feather) text-center'
			style={{ filter, opacity, visibility, y }}
		>
			{digit}
		</motion.span>
	)
}

/** A digit wheel. It always turns in the direction the whole number moved, wrapping 9 → 0 like an odometer. */
function Column({
	digit,
	direction,
	armed,
	delay,
	reduceMotion,
}: {
	digit: number
	direction: number
	armed: boolean
	delay: number
	reduceMotion: boolean
}) {
	const position = useMotionValue(armed ? 0 : digit)
	const wheel = useRef({ digit: armed ? 0 : digit, revealed: !armed, target: armed ? 0 : digit })
	useEffect(() => {
		const state = wheel.current
		if (armed || state.digit === digit) {
			if (!armed) {
				state.revealed = true
			}
			return
		}
		state.target +=
			direction < 0 && state.revealed ? -((state.digit - digit + 10) % 10) : (digit - state.digit + 10) % 10
		state.digit = digit
		if (reduceMotion) {
			position.jump(state.target)
		} else {
			animate(position, state.target, state.revealed ? motionTokens.spring.smooth : { ...reveal, delay })
		}
		state.revealed = true
	}, [armed, delay, digit, direction, position, reduceMotion])
	// The wheel's window reaches a little past the line box and feathers out, so a turning digit fades at the edge instead of being cut.
	return (
		<motion.span
			className='relative -my-(--feather) inline-block overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_calc(var(--feather)*1.5),#000_calc(100%-var(--feather)*1.5),transparent)] py-(--feather) [--feather:.16em]'
			{...presence}
			transition={reduceMotion ? { duration: 0 } : motionTokens.spring.morph}
		>
			<span className='invisible'>0</span>
			{DIGITS.map(item => (
				<Glyph key={item} position={position} digit={item} />
			))}
		</motion.span>
	)
}

// Separators clip sideways only, so a comma keeps its tail.
const symbol = 'inline-block overflow-x-clip'

export function AnimatedCounter({
	value,
	prefix = '',
	suffix = '',
	decimals = 0,
	animateOnView = false,
	locale = 'en-US',
}: AnimatedCounterProps) {
	const ref = useRef<HTMLSpanElement>(null)
	const inView = useInView(ref, { amount: 0.6, once: true })
	const reduceMotion = !!useReducedMotion()
	const [previous, setPrevious] = useState(value)
	const [direction, setDirection] = useState(1)
	if (value !== previous) {
		setPrevious(value)
		setDirection(value > previous ? 1 : -1)
	}
	const parts = partsFor(value, decimals, locale)
	const text = `${prefix}${parts.map(part => ('text' in part ? part.text : part.digit)).join('')}${suffix}`
	const armed = animateOnView && !inView
	return (
		<span
			ref={ref}
			className='relative inline-flex flex-col font-(family-name:--font-display) text-3xl leading-none font-medium tracking-(--tracking-display) text-foreground tabular-nums'
		>
			<span className='sr-only'>{text}</span>
			<span className='inline-flex items-start whitespace-nowrap select-none' aria-hidden='true'>
				{prefix && <span className={symbol}>{prefix}</span>}
				<AnimatePresence initial={false}>
					{parts.map(part =>
						'digit' in part ? (
							<Column
								key={part.key}
								digit={part.digit}
								direction={direction}
								armed={armed}
								delay={Math.min(part.order * motionTokens.stagger.item, 0.25)}
								reduceMotion={reduceMotion}
							/>
						) : (
							<motion.span
								key={part.key}
								className={symbol}
								{...presence}
								transition={reduceMotion ? { duration: 0 } : motionTokens.spring.morph}
							>
								{part.text}
							</motion.span>
						),
					)}
				</AnimatePresence>
				{suffix && <span className={symbol}>{suffix}</span>}
			</span>
		</span>
	)
}

export default AnimatedCounter
