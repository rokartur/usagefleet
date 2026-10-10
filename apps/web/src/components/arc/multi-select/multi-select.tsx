'use client'

import { useId, useMemo, useState } from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { ChevronDown, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export interface MultiSelectOption {
	value: string
	label: string
	disabled?: boolean
}

export interface MultiSelectProps {
	label: string
	options: MultiSelectOption[]
	value?: string[]
	defaultValue?: string[]
	onValueChange?: (value: string[]) => void
	placeholder?: string
	description?: string
	maxVisible?: number
	disabled?: boolean
	className?: string
}

const enter = motionTokens.ease.enter
const standard = motionTokens.ease.standard
/** Each chip sits in a slot whose width opens and collapses on a spring, so neighbours travel with it and nothing overlaps. */
const slot: Variants = {
	hidden: { width: 0, opacity: 0 },
	shown: {
		width: 'auto',
		opacity: 1,
		transition: {
			width: motionTokens.spring.smooth,
			opacity: { duration: motionTokens.duration.fast, ease: enter },
		},
	},
	gone: {
		width: 0,
		opacity: 0,
		transition: {
			width: motionTokens.spring.smooth,
			opacity: { duration: motionTokens.duration.instant, ease: standard },
		},
	},
}
/** The chip itself grows in from .9 with a soft blur and shrinks back as it leaves. */
const chip: Variants = {
	hidden: { scale: 0.9, filter: `blur(${motionTokens.blur.soft}px)` },
	shown: {
		scale: 1,
		filter: 'blur(0px)',
		transition: {
			...motionTokens.spring.snappy,
			filter: { duration: motionTokens.duration.standard, ease: enter },
		},
	},
	gone: {
		scale: 0.9,
		filter: `blur(${motionTokens.blur.subtle}px)`,
		transition: { duration: motionTokens.duration.instant, ease: standard },
	},
}
/** Reduced motion keeps short crossfades; resting states match the moving variants so server and client markup agree. */
const fade: Variants = {
	hidden: { opacity: 0 },
	shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: motionTokens.duration.instant } },
	gone: { opacity: 0, transition: { duration: motionTokens.duration.instant } },
}
const slotFade: Variants = {
	hidden: { opacity: 0 },
	shown: { width: 'auto', opacity: 1, transition: { duration: motionTokens.duration.instant } },
	gone: { opacity: 0, transition: { duration: motionTokens.duration.instant } },
}
const chipStill: Variants = {
	hidden: { scale: 1, filter: 'blur(0px)' },
	shown: { scale: 1, filter: 'blur(0px)' },
	gone: { scale: 1, filter: 'blur(0px)' },
}
/** The overflow count rolls: a larger number rises from below, a smaller one drops from above. */
const roll: Variants = {
	hidden: (direction: number) => ({
		opacity: 0,
		y: `${direction * 0.5}em`,
		filter: `blur(${motionTokens.blur.subtle}px)`,
	}),
	shown: {
		opacity: 1,
		y: 0,
		filter: 'blur(0px)',
		transition: { duration: motionTokens.duration.standard, ease: enter },
	},
	gone: (direction: number) => ({
		opacity: 0,
		y: `${direction * -0.5}em`,
		filter: `blur(${motionTokens.blur.subtle}px)`,
		transition: { duration: motionTokens.duration.instant, ease: standard },
	}),
}

/** A check that draws itself when an option is picked and retracts when it is removed. */
function CheckMark({ reduce }: { reduce: boolean | null }) {
	return (
		<svg
			className='flex-none'
			width='16'
			height='16'
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.75'
			strokeLinecap='round'
			strokeLinejoin='round'
			aria-hidden='true'
		>
			<motion.path
				d='M4 12.5 9 17.5 20 6.5'
				initial={reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
				animate={{ pathLength: 1, opacity: 1 }}
				exit={reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
				transition={
					reduce
						? { duration: motionTokens.duration.instant }
						: {
								pathLength: { duration: motionTokens.duration.standard, ease: enter },
								opacity: { duration: motionTokens.duration.instant },
							}
				}
			/>
		</svg>
	)
}

// The trigger anchors the menu, so press feedback stays in colour; it never scales.
const triggerClass =
	'group relative flex min-h-(--control-height-md) w-full items-center gap-2 rounded-(--radius-control) border bg-(--surface) py-[5px] pr-[11px] pl-3 text-left text-sm text-(--foreground) transition-[border-color,background-color] duration-(--duration-fast) ease-(--ease-standard) hover:not-data-disabled:border-(--border-strong) hover:not-data-disabled:bg-(--surface-muted) active:not-data-disabled:border-(--border-strong) active:not-data-disabled:bg-(--surface-muted) data-disabled:cursor-not-allowed data-disabled:opacity-50 data-popup-open:border-(--border-strong) data-popup-open:bg-(--surface-muted) motion-reduce:transition-none'
const chipClass =
	'box-border max-w-36 flex-none truncate mr-[5px] rounded-(--radius-pill) px-2 py-1 text-xs whitespace-nowrap text-(--foreground) bg-(--surface-muted) shadow-[inset_0_0_0_1px_var(--border-subtle)] transition-colors duration-(--duration-fast) ease-(--ease-standard) group-hover:bg-(--surface) group-data-popup-open:bg-(--surface) motion-reduce:transition-none'
// The slot clips while its width springs open or closed; the chip keeps its natural width so the label never re-truncates mid-flight.
const slotClass = 'flex min-w-0 flex-[0_1_auto] overflow-hidden'

const noneSelected: string[] = []
export function MultiSelect({
	label,
	options,
	value,
	defaultValue = noneSelected,
	onValueChange,
	placeholder = 'Select options',
	description,
	maxVisible = 2,
	disabled = false,
	className,
}: MultiSelectProps) {
	const id = useId()
	const labelId = `${id}-label`
	const valueId = `${id}-value`
	const reduce = useReducedMotion()
	const [internal, setInternal] = useState(defaultValue)
	const selected = value ?? internal
	const selectedSet = useMemo(() => new Set(selected), [selected])
	const labelFor = (item: string) => options.find(option => option.value === item)?.label ?? item
	const visible = selected.slice(0, maxVisible).map(item => ({ value: item, label: labelFor(item) }))
	const remaining = Math.max(0, selected.length - visible.length)
	const [previousRemaining, setPreviousRemaining] = useState(remaining)
	const [countDirection, setCountDirection] = useState(1)
	if (previousRemaining !== remaining) {
		setPreviousRemaining(remaining)
		setCountDirection(remaining > previousRemaining ? 1 : -1)
	}
	const update = (next: string[]) => {
		if (value === undefined) {
			setInternal(next)
		}
		onValueChange?.(next)
	}

	return (
		<div className={cn('relative grid min-w-0 gap-2', className)}>
			<span id={labelId} className='text-sm leading-(--leading-body) font-medium'>
				{label}
			</span>
			<SelectPrimitive.Root multiple items={options} value={selected} onValueChange={update} disabled={disabled}>
				<div className='relative min-w-0'>
					<SelectPrimitive.Trigger className={triggerClass} aria-labelledby={`${labelId} ${valueId}`}>
						<span id={valueId} className='sr-only'>
							{selected.length ? selected.map(labelFor).join(', ') : placeholder}
						</span>
						<span
							className='relative flex min-h-[26px] min-w-0 flex-1 items-center overflow-hidden'
							aria-hidden='true'
						>
							<AnimatePresence initial={false}>
								{visible.map(item => (
									<motion.span
										key={`chip-${item.value}`}
										className={slotClass}
										variants={reduce ? slotFade : slot}
										initial='hidden'
										animate='shown'
										exit='gone'
									>
										<motion.span className={chipClass} variants={reduce ? chipStill : chip}>
											{item.label}
										</motion.span>
									</motion.span>
								))}
								{remaining > 0 && (
									<motion.span
										key='more'
										className={cn(slotClass, 'shrink-0')}
										variants={reduce ? slotFade : slot}
										initial='hidden'
										animate='shown'
										exit='gone'
									>
										<motion.span
											className={cn(
												chipClass,
												'inline-flex text-(--text-secondary) tabular-nums',
											)}
											variants={reduce ? chipStill : chip}
										>
											+
											<span className='inline-grid *:[grid-area:1/1]'>
												<AnimatePresence initial={false} custom={countDirection}>
													<motion.span
														key={remaining}
														custom={countDirection}
														variants={reduce ? fade : roll}
														initial='hidden'
														animate='shown'
														exit='gone'
													>
														{remaining}
													</motion.span>
												</AnimatePresence>
											</span>
										</motion.span>
									</motion.span>
								)}
								{/* The placeholder sits outside the flow so the first chip can open its slot from the leading edge. */}
								{!selected.length && (
									<motion.span
										key='placeholder'
										className='absolute inset-0 flex items-center overflow-hidden whitespace-nowrap text-(--text-muted)'
										variants={fade}
										initial='hidden'
										animate='shown'
										exit='gone'
									>
										{placeholder}
									</motion.span>
								)}
							</AnimatePresence>
						</span>
						{/* The chevron stays pinned to the trailing edge; a selection only reserves room for the clear button beside it, so nothing jumps. */}
						<ChevronDown
							className={cn(
								'flex-none text-(--text-muted) transition-transform duration-(--duration-spring) ease-(--ease-spring) group-data-popup-open:rotate-180 motion-reduce:transition-none',
								selected.length > 0 && 'ml-[26px]',
							)}
							size={16}
							aria-hidden='true'
						/>
					</SelectPrimitive.Trigger>
					<AnimatePresence initial={false}>
						{selected.length > 0 && !disabled && (
							<motion.button
								type='button'
								aria-label='Clear selections'
								className='absolute inset-y-0 right-9 my-auto grid size-[22px] place-items-center rounded-(--radius-pill) text-(--text-muted) transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-(--surface) hover:text-(--foreground) motion-reduce:transition-none'
								onClick={() => update([])}
								initial={
									reduce
										? { opacity: 0 }
										: { opacity: 0, scale: 0.6, filter: `blur(${motionTokens.blur.subtle}px)` }
								}
								animate={{
									opacity: 1,
									scale: 1,
									filter: 'blur(0px)',
									transition: reduce
										? { duration: motionTokens.duration.instant }
										: {
												...motionTokens.spring.snappy,
												opacity: { duration: motionTokens.duration.fast },
											},
								}}
								exit={{
									opacity: 0,
									...(reduce ? {} : { scale: 0.6, filter: `blur(${motionTokens.blur.subtle}px)` }),
									transition: { duration: motionTokens.duration.instant, ease: standard },
								}}
								whileTap={{
									scale: reduce ? 1 : 0.96,
									transition: { duration: motionTokens.duration.instant, ease: standard },
								}}
							>
								<X size={14} aria-hidden='true' />
							</motion.button>
						)}
					</AnimatePresence>
				</div>
				<SelectPrimitive.Portal>
					<SelectPrimitive.Positioner
						className='z-80'
						alignItemWithTrigger={false}
						sideOffset={8}
						collisionPadding={12}
					>
						<SelectPrimitive.Popup
							aria-label={label}
							className='max-h-[min(320px,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-(--radius-panel) border bg-(--surface-raised) p-[5px] shadow-(--shadow-floating) outline-none [transition:opacity_var(--duration-fast)_var(--ease-enter),translate_var(--duration-spring)_var(--ease-spring),scale_var(--duration-spring)_var(--ease-spring)] data-ending-style:-translate-y-1 data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:duration-(--duration-instant) data-ending-style:ease-(--ease-standard) data-starting-style:-translate-y-1.5 data-starting-style:scale-97 data-starting-style:opacity-0 motion-reduce:[transition:opacity_var(--duration-instant)]'
						>
							<SelectPrimitive.List>
								{/* Arrow keys move the highlight often, so it changes almost instantly. Selection is shown by the check, not by weight, so labels never reflow. */}
								{options.map(option => (
									<SelectPrimitive.Item
										key={option.value}
										value={option.value}
										disabled={option.disabled}
										className='flex min-h-9 w-full items-center justify-between gap-3 rounded-[calc(var(--radius-panel)-5px)] px-[11px] text-left text-sm text-(--foreground) transition-colors duration-[80ms] ease-(--ease-standard) outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-42 data-highlighted:bg-(--surface-muted) motion-reduce:transition-none'
									>
										<SelectPrimitive.ItemText className='min-w-0 truncate'>
											{option.label}
										</SelectPrimitive.ItemText>
										<AnimatePresence initial={false}>
											{selectedSet.has(option.value) && <CheckMark key='check' reduce={reduce} />}
										</AnimatePresence>
									</SelectPrimitive.Item>
								))}
							</SelectPrimitive.List>
						</SelectPrimitive.Popup>
					</SelectPrimitive.Positioner>
				</SelectPrimitive.Portal>
			</SelectPrimitive.Root>
			{description && <span className='text-xs text-(--text-muted)'>{description}</span>}
		</div>
	)
}
