'use client'

import { useEffect, useRef, useState } from 'react'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import type { Transition } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export interface SwitchProps extends Omit<SwitchPrimitive.Root.Props, 'className'> {
	label?: string
	className?: string
}

/** Track inner width (42 - 6 padding) minus the 18px thumb; keep in sync with the track classes below. */
const size = 18
const travel = 18
/** How far the thumb widens toward the other side while pressed. */
const stretch = 5
/** Critically damped: the thumb lands on its end without overshooting the state it reports. */
const glide: Transition = { type: 'spring', visualDuration: 0.3, bounce: 0 }

export function Switch({
	label,
	className,
	checked,
	defaultChecked,
	onCheckedChange,
	onPointerDown,
	onPointerUp,
	onPointerLeave,
	onPointerCancel,
	onKeyDown,
	onKeyUp,
	onBlur,
	...props
}: SwitchProps) {
	const reduceMotion = useReducedMotion()
	const [internal, setInternal] = useState(defaultChecked ?? false)
	const [pressed, setPressed] = useState(false)
	const on = checked ?? internal
	// A brief stretch along the travel, so the thumb reads as moving mass rather than a sliding dot.
	const scaleX = useMotionValue(1)
	const shown = useRef(on)
	// A pointer or Space press already stretched the thumb, so its release should not add a second stretch on top.
	const releasedAt = useRef(-Infinity)
	useEffect(() => {
		if (shown.current === on) {
			return
		}
		shown.current = on
		const fromPress = performance.now() - releasedAt.current < 250
		if (reduceMotion || fromPress) {
			return
		}
		const controls = animate(scaleX, [1, 1.16, 1], {
			duration: 0.34,
			times: [0, 0.4, 1],
			ease: ['easeOut', 'easeInOut'],
		})
		return () => controls.stop()
	}, [on, reduceMotion, scaleX])
	const extra = pressed && !reduceMotion && !props.disabled ? stretch : 0

	return (
		<SwitchPrimitive.Root
			{...props}
			nativeButton
			render={<button type='button' />}
			checked={on}
			onCheckedChange={(next, details) => {
				if (checked === undefined) {
					setInternal(next)
				}
				onCheckedChange?.(next, details)
			}}
			onPointerDown={event => {
				onPointerDown?.(event)
				if (event.button === 0) {
					setPressed(true)
				}
			}}
			onPointerUp={event => {
				onPointerUp?.(event)
				if (pressed && !props.disabled) {
					releasedAt.current = performance.now()
				}
				setPressed(false)
			}}
			onPointerLeave={event => {
				onPointerLeave?.(event)
				setPressed(false)
			}}
			onPointerCancel={event => {
				onPointerCancel?.(event)
				setPressed(false)
			}}
			onKeyDown={event => {
				onKeyDown?.(event)
				if (event.key === ' ') {
					setPressed(true)
				}
			}}
			onKeyUp={event => {
				onKeyUp?.(event)
				if (pressed && !props.disabled) {
					releasedAt.current = performance.now()
				}
				setPressed(false)
			}}
			onBlur={event => {
				onBlur?.(event)
				setPressed(false)
			}}
			className={cn(
				'group inline-flex min-h-(--control-height-md) items-center gap-3 text-sm text-(--foreground) [-webkit-tap-highlight-color:transparent] data-disabled:cursor-not-allowed data-disabled:opacity-50',
				className,
			)}
			aria-label={props['aria-label'] ?? label}
		>
			{/* Fixed box: the thumb moves inside it with transforms, so nothing around the switch shifts. The track crossfades between the two fills. */}
			<span className='relative isolate box-border flex h-6 w-[42px] flex-none items-center rounded-(--radius-pill) bg-(--control-track) p-[3px] transition-colors duration-(--duration-fast) ease-(--ease-standard) group-data-unchecked:group-hover:bg-(--control-track-hover) before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:bg-(--control-on) before:opacity-0 before:transition-opacity before:duration-(--duration-standard) before:ease-(--ease-standard) group-data-checked:before:opacity-100 motion-reduce:transition-none motion-reduce:before:transition-none'>
				{/* The thumb stretches like a held finger and keeps its far edge anchored, then travels on a spring. */}
				<motion.span
					className='size-[18px] flex-none rounded-(--radius-pill) bg-(--control-thumb) shadow-(--control-thumb-shadow) transition-colors duration-(--duration-standard) ease-(--ease-standard) will-change-transform group-data-checked:bg-(--control-thumb-on) motion-reduce:transition-none'
					style={{ scaleX }}
					initial={false}
					animate={{ x: on ? travel - extra : 0, width: size + extra }}
					transition={reduceMotion ? { duration: 0 } : { x: glide, width: motionTokens.spring.snappy }}
				/>
			</span>
			{label ? <span className='leading-(--leading-body)'>{label}</span> : null}
		</SwitchPrimitive.Root>
	)
}

export default Switch
