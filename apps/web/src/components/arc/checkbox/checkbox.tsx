'use client'

import { useId, useState } from 'react'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { motion, useReducedMotion } from 'motion/react'
import type { Transition } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export interface CheckboxProps extends Omit<CheckboxPrimitive.Root.Props, 'className'> {
	label?: string
	description?: string
	className?: string
}

/** Both marks share three points, so the check morphs into the dash and back instead of swapping. */
const checkPath = 'M4.25 9.25 L7.25 12.25 L13.75 5.75'
const dashPath = 'M4.75 9 L9 9 L13.25 9'

export function Checkbox({
	label,
	description,
	id,
	className,
	checked,
	defaultChecked,
	onCheckedChange,
	indeterminate = false,
	...props
}: CheckboxProps) {
	const generatedId = useId()
	const controlId = id ?? generatedId
	const reduced = useReducedMotion()
	const [internal, setInternal] = useState(defaultChecked ?? false)
	const state = checked ?? internal
	const on = state || indeterminate
	const change: CheckboxPrimitive.Root.Props['onCheckedChange'] = (next, details) => {
		if (checked === undefined) {
			setInternal(next)
		}
		onCheckedChange?.(next, details)
	}
	const fade: Transition = {
		duration: on ? motionTokens.duration.instant : motionTokens.duration.fast,
		ease: [...motionTokens.ease.standard],
	}
	return (
		<div className='inline-flex min-w-0 items-start'>
			{/* Sibling label (htmlFor), so the root renders a native button as Base UI asks for that pattern. */}
			<CheckboxPrimitive.Root
				{...props}
				id={controlId}
				nativeButton
				render={<button type='button' />}
				checked={state}
				indeterminate={indeterminate}
				onCheckedChange={change}
				className={cn(
					'group relative grid size-(--control-height-md) flex-none place-items-center rounded-(--radius-control) text-(--control-glyph) [-webkit-tap-highlight-color:transparent] data-disabled:cursor-not-allowed data-disabled:opacity-50',
					className,
				)}
				aria-describedby={description ? `${controlId}-description` : undefined}
				aria-label={props['aria-label'] ?? (label ? undefined : 'Checkbox')}
			>
				{/* The square is the only part that reacts to a press, so the hit area and label never move. */}
				<span
					className='relative block size-[18px] rounded-[5px] border border-(--border-strong) bg-(--surface) [transition:border-color_var(--duration-fast)_var(--ease-standard),scale_var(--duration-spring)_var(--ease-spring)] group-active:scale-95 group-active:[transition-duration:var(--duration-fast),var(--duration-instant)] group-data-checked:border-(--control-on) group-data-indeterminate:border-(--control-on) group-data-unchecked:group-hover:border-(--text-muted) motion-reduce:scale-100 motion-reduce:transition-none'
					aria-hidden='true'
				>
					<motion.span
						className='absolute -inset-px rounded-[inherit] bg-(--control-on)'
						initial={false}
						animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.6 }}
						transition={reduced ? { duration: 0 } : { scale: motionTokens.spring.snappy, opacity: fade }}
					/>
					<svg
						className='absolute -inset-px size-[18px] overflow-visible'
						viewBox='0 0 18 18'
						fill='none'
						focusable='false'
					>
						<motion.path
							initial={false}
							animate={{
								d: indeterminate ? dashPath : checkPath,
								pathLength: on ? 1 : 0,
								opacity: on ? 1 : 0,
							}}
							transition={
								reduced
									? { duration: 0 }
									: {
											d: motionTokens.spring.morph,
											pathLength: motionTokens.spring.snappy,
											opacity: fade,
										}
							}
							stroke='currentColor'
							strokeWidth={1.75}
							strokeLinecap='round'
							strokeLinejoin='round'
						/>
					</svg>
				</span>
			</CheckboxPrimitive.Root>
			{/* The label's first line centers on the square: (44px box - 19.6px line) / 2. */}
			{label || description ? (
				<div className='ml-px grid min-w-0 gap-0.5 pt-[calc((var(--control-height-md)-var(--text-sm)*1.4)/2)]'>
					{label ? (
						<label
							className='cursor-pointer text-sm leading-(--leading-body) font-medium text-(--foreground)'
							htmlFor={controlId}
						>
							{label}
						</label>
					) : null}
					{description ? (
						<span
							className='text-xs leading-(--leading-body) text-(--text-muted)'
							id={`${controlId}-description`}
						>
							{description}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	)
}
