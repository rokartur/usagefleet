'use client'

import { useId, useState } from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export interface SelectProps<V extends string = string> extends Omit<
	SelectPrimitive.Root.Props<V>,
	'children' | 'value' | 'defaultValue' | 'onValueChange' | 'items'
> {
	label: string
	description?: string
	placeholder?: string
	id?: string
	className?: string
	options: { value: V; label: string; disabled?: boolean }[]
	value?: V
	defaultValue?: V
	onValueChange?: (value: V) => void
}

/** The shown value rolls in the direction of the list: a later option rises from below, an earlier one drops from above. */
const valueRoll: Variants = {
	enter: (direction: number) => ({
		opacity: 0,
		y: `${direction * 0.35}em`,
		filter: `blur(${motionTokens.blur.soft}px)`,
	}),
	center: {
		opacity: 1,
		y: 0,
		filter: 'blur(0px)',
		transition: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] },
	},
	exit: (direction: number) => ({
		opacity: 0,
		y: `${direction * -0.3}em`,
		filter: `blur(${motionTokens.blur.subtle}px)`,
		transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] },
	}),
}
/** Reduced motion keeps a short crossfade; the resting state matches valueRoll so server and client markup agree. */
const valueFade: Variants = {
	enter: { opacity: 0 },
	center: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: motionTokens.duration.instant } },
	exit: { opacity: 0, transition: { duration: motionTokens.duration.instant } },
}

export function Select<V extends string>({
	label,
	description,
	placeholder = 'Select an option',
	options,
	id,
	className,
	value,
	defaultValue,
	onValueChange,
	...rootProps
}: SelectProps<V>) {
	const generatedId = useId()
	const controlId = id ?? generatedId
	const hintId = description ? `${controlId}-description` : undefined
	const reduceMotion = useReducedMotion()
	const [uncontrolledValue, setUncontrolledValue] = useState<V | null>(defaultValue ?? null)
	const currentValue = value ?? uncontrolledValue
	const index = options.findIndex(option => option.value === currentValue)
	const shown = currentValue ? (options[index]?.label ?? '') : placeholder
	const [previousIndex, setPreviousIndex] = useState(index)
	const [direction, setDirection] = useState(1)
	if (previousIndex !== index) {
		setPreviousIndex(index)
		setDirection(index > previousIndex ? 1 : -1)
	}

	return (
		<div className='grid min-w-0 gap-2'>
			<label className='text-sm font-medium' htmlFor={controlId}>
				{label}
			</label>
			<SelectPrimitive.Root<V>
				{...rootProps}
				items={options}
				value={currentValue}
				onValueChange={next => {
					if (next === null) {
						return
					}
					setUncontrolledValue(next)
					onValueChange?.(next)
				}}
			>
				{/* The trigger anchors the menu, so it never scales: press feedback is colour only. */}
				<SelectPrimitive.Trigger
					id={controlId}
					aria-describedby={hintId}
					className={cn(
						'group relative box-border flex min-h-(--control-height-md) w-full items-center justify-between gap-3 rounded-(--radius-control) border bg-(--surface) px-3 text-left text-sm text-(--foreground) transition-[border-color,background-color,box-shadow] duration-(--duration-fast) ease-(--ease-standard) hover:not-data-disabled:border-(--border-strong) hover:not-data-disabled:bg-(--surface-muted) focus-visible:border-(--border-strong) active:not-data-disabled:border-(--border-strong) active:not-data-disabled:bg-(--surface-muted) data-disabled:cursor-not-allowed data-disabled:opacity-50 data-popup-open:border-(--border-strong) data-popup-open:bg-(--surface-muted) motion-reduce:transition-none',
						className,
					)}
				>
					{/* Base UI keeps the real value for assistive tech; the visible copy below animates between values. */}
					<span className='sr-only'>
						<SelectPrimitive.Value placeholder={placeholder} />
					</span>
					<span
						className='grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] *:min-w-0 *:truncate *:[grid-area:1/1] *:data-placeholder:text-(--text-muted)'
						aria-hidden='true'
					>
						<AnimatePresence initial={false} custom={direction}>
							<motion.span
								key={currentValue ? `value-${currentValue}` : 'placeholder'}
								data-placeholder={currentValue ? undefined : ''}
								custom={direction}
								variants={reduceMotion ? valueFade : valueRoll}
								initial='enter'
								animate='center'
								exit='exit'
							>
								{shown}
							</motion.span>
						</AnimatePresence>
					</span>
					<SelectPrimitive.Icon className='inline-flex flex-none text-(--text-muted) [transition:rotate_var(--duration-spring)_var(--ease-spring),color_var(--duration-fast)_var(--ease-standard)] group-data-popup-open:rotate-180 motion-reduce:transition-none'>
						<ChevronDown size={16} strokeWidth={1.75} aria-hidden='true' />
					</SelectPrimitive.Icon>
				</SelectPrimitive.Trigger>
				<SelectPrimitive.Portal>
					<SelectPrimitive.Positioner
						className='z-1000'
						alignItemWithTrigger={false}
						sideOffset={4}
						collisionPadding={12}
					>
						{/* The menu grows from the trigger edge it opened against. */}
						<SelectPrimitive.Popup className='box-border max-h-[min(320px,var(--available-height))] max-w-[min(24rem,calc(100vw-20px))] min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-[calc(var(--radius-control)+2px)] border bg-(--surface-raised) p-1.5 text-(--foreground) shadow-(--shadow-floating) transition-[opacity,translate,scale] duration-(--duration-standard) ease-(--ease-enter) [--menu-x:0px] [--menu-y:-6px] data-ending-style:translate-x-[calc(var(--menu-x)/2)] data-ending-style:translate-y-[calc(var(--menu-y)/2)] data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:duration-(--duration-instant) data-ending-style:ease-(--ease-standard) data-starting-style:translate-x-(--menu-x) data-starting-style:translate-y-(--menu-y) data-starting-style:scale-97 data-starting-style:opacity-0 data-[side=left]:[--menu-x:6px] data-[side=left]:[--menu-y:0px] data-[side=right]:[--menu-x:-6px] data-[side=right]:[--menu-y:0px] data-[side=top]:[--menu-y:6px] motion-reduce:transition-opacity motion-reduce:duration-(--duration-instant)'>
							<SelectPrimitive.List className='py-0.5'>
								{options.map(option => (
									<SelectPrimitive.Item
										key={option.value}
										value={option.value}
										disabled={option.disabled}
										className='relative flex min-h-9 cursor-default items-center rounded-[calc(var(--radius-control)-4px)] pr-[34px] pl-[11px] text-sm whitespace-nowrap text-(--foreground) transition-colors duration-(--duration-instant) ease-(--ease-standard) outline-none select-none data-disabled:opacity-45 data-highlighted:bg-(--surface-muted) motion-reduce:transition-none'
									>
										<SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
										<SelectPrimitive.ItemIndicator className='absolute right-2.5 inline-flex animate-[indicator-in_var(--duration-standard)_var(--ease-enter)_40ms_both] items-center text-(--foreground) motion-reduce:animate-none'>
											<Check size={16} strokeWidth={1.75} aria-hidden='true' />
										</SelectPrimitive.ItemIndicator>
									</SelectPrimitive.Item>
								))}
							</SelectPrimitive.List>
						</SelectPrimitive.Popup>
					</SelectPrimitive.Positioner>
				</SelectPrimitive.Portal>
			</SelectPrimitive.Root>
			{description && (
				<span id={hintId} className='text-xs text-(--text-muted)'>
					{description}
				</span>
			)}
		</div>
	)
}
