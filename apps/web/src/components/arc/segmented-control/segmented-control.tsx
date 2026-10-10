'use client'

import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export interface Segment<V extends string = string> {
	value: V
	label: string
	/** Optional content after the label, such as a badge. */ accessory?: ReactNode
	/** Spoken name when the visible label is an abbreviation. */ ariaLabel?: string
}
export interface SegmentedControlProps<V extends string = string> {
	options: Segment<V>[]
	/** A value matching no option shows nothing selected, e.g. before a stored choice is known. */
	value: V | ''
	onValueChange: (value: V) => void
	label?: string
	/** Called when the pointer or focus reaches an option, before it is chosen. Use it to start loading what that option shows. */
	onOptionIntent?: (value: V) => void
	className?: string
}

export default function SegmentedControl<V extends string>({
	options,
	value,
	onValueChange,
	label,
	onOptionIntent,
	className,
}: SegmentedControlProps<V>) {
	const id = useId()
	const reduced = useReducedMotion()
	const track = useRef<HTMLDivElement>(null)

	// When the options are wider than the container, the track scrolls inside itself. Edges fade only on the side with more to see.
	useLayoutEffect(() => {
		const node = track.current
		if (!node) {
			return
		}
		const edges = () => {
			const rest = node.scrollWidth - node.clientWidth - node.scrollLeft
			node.toggleAttribute('data-fade-start', node.scrollLeft > 1)
			node.toggleAttribute('data-fade-end', rest > 1)
		}
		edges()
		node.addEventListener('scroll', edges, { passive: true })
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(edges)
		observer?.observe(node)
		return () => {
			node.removeEventListener('scroll', edges)
			observer?.disconnect()
		}
	}, [options.length])

	// The selected option is always scrolled fully into view, with a little room so it clears the fade.
	const first = useRef(true)
	useEffect(() => {
		const node = track.current
		const button = node?.querySelector<HTMLElement>('[aria-pressed="true"]')
		if (!node || !button || node.scrollWidth <= node.clientWidth) {
			first.current = false
			return
		}
		const room = 20
		const start = button.offsetLeft - room
		const end = button.offsetLeft + button.offsetWidth + room - node.clientWidth
		const left = node.scrollLeft > start ? start : node.scrollLeft < end ? end : node.scrollLeft
		if (left !== node.scrollLeft) {
			node.scrollTo({ left: Math.max(0, left), behavior: first.current || reduced ? 'auto' : 'smooth' })
		}
		first.current = false
	}, [value, reduced])

	// Base UI moves focus with the arrow keys; pressing the selected option again would empty the group, so that change is ignored.
	return (
		<div
			className={cn(
				'inline-flex max-w-full min-w-0 shrink rounded-(--radius-control) border bg-(--surface-muted)',
				className,
			)}
		>
			<LayoutGroup id={id}>
				<ToggleGroup
					aria-label={label}
					value={value ? [value] : []}
					onValueChange={next => {
						const picked = options.find(option => option.value === next[0])
						if (picked) {
							onValueChange(picked.value)
						}
					}}
					render={<motion.div ref={track} layoutScroll />}
					// The track owns the stacking context so the gliding highlight passes under every label; edges fade only on the side with more to see.
					className='isolate flex min-w-0 [scrollbar-width:none] gap-0.5 overflow-x-auto overscroll-x-contain rounded-[inherit] [mask-image:linear-gradient(to_right,transparent,#000_var(--fade-start),#000_calc(100%-var(--fade-end)),transparent)] p-[3px] [--fade-end:0px] [--fade-start:0px] data-fade-end:[--fade-end:20px] data-fade-start:[--fade-start:20px]'
				>
					{/* Items never scale or change weight; only the highlight travels and the label colour follows it. */}
					{options.map(option => (
						<Toggle
							key={option.value}
							value={option.value}
							aria-label={option.ariaLabel}
							className='relative min-h-(--control-height-sm) flex-none rounded-[calc(var(--radius-control)-4px)] px-3 text-sm font-medium whitespace-nowrap text-(--text-muted) transition-colors duration-(--duration-fast) ease-(--ease-standard) [-webkit-tap-highlight-color:transparent] hover:text-(--foreground) active:text-(--foreground) data-pressed:text-(--foreground) motion-reduce:transition-none max-[380px]:px-2.5'
							onPointerEnter={onOptionIntent ? () => onOptionIntent(option.value) : undefined}
							onFocus={onOptionIntent ? () => onOptionIntent(option.value) : undefined}
						>
							{value === option.value && (
								<motion.span
									className='absolute inset-0 -z-1 rounded-[inherit] border bg-(--surface) shadow-(--shadow-resting)'
									layoutId='selection'
									layoutDependency={value}
									transition={reduced ? { duration: 0 } : motionTokens.spring.morph}
									aria-hidden='true'
								/>
							)}
							<span className='relative z-1 inline-flex items-center gap-1.5'>
								{option.label}
								{option.accessory}
							</span>
						</Toggle>
					))}
				</ToggleGroup>
			</LayoutGroup>
		</div>
	)
}
