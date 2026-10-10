'use client'

import { useId } from 'react'
import { NumberField as NumberFieldPrimitive } from '@base-ui/react/number-field'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NumberFieldSize = 'sm' | 'md' | 'lg'

export interface NumberFieldProps {
	label: string
	value: number
	onValueChange: (value: number) => void
	description?: string
	min?: number
	max?: number
	step?: number
	size?: NumberFieldSize
	locale?: Intl.LocalesArgument
	disabled?: boolean
	className?: string
}

// Set --number-field-width on an ancestor to resize the shell.
const sizes: Record<NumberFieldSize, string> = {
	sm: '[--nf-height:var(--control-height-sm)] [--nf-inset:3px] [--nf-step:28px] [--nf-text:var(--text-sm)] [--nf-width:var(--number-field-width,164px)]',
	md: '[--nf-height:var(--control-height-md)] [--nf-inset:3px] [--nf-step:34px] [--nf-text:var(--text-base)] [--nf-width:var(--number-field-width,196px)]',
	lg: '[--nf-height:var(--control-height-lg)] [--nf-inset:4px] [--nf-step:40px] [--nf-text:var(--text-lg)] [--nf-width:var(--number-field-width,228px)]',
}

// Quick press, spring release: the fill deepens and the glyph sinks. Radius steps in by the shell's inset, so the pressed fill sits concentric with it.
const stepClass =
	'grid size-(--nf-step) flex-none place-items-center rounded-[calc(var(--radius-control)-var(--nf-inset)-1px)] text-(--text-secondary) touch-manipulation select-none outline-none [-webkit-tap-highlight-color:transparent] transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:not-data-disabled:bg-(--surface-muted) hover:not-data-disabled:text-(--foreground) focus-visible:bg-(--surface-muted) focus-visible:text-(--foreground) active:not-data-disabled:bg-[color-mix(in_oklab,var(--foreground)_10%,var(--surface))] active:not-data-disabled:text-(--foreground) active:not-data-disabled:duration-[60ms] data-disabled:cursor-not-allowed data-disabled:opacity-32 [&_svg]:[transition:scale_var(--duration-spring)_var(--ease-spring)] active:not-data-disabled:[&_svg]:scale-82 active:not-data-disabled:[&_svg]:[transition:scale_90ms_var(--ease-standard)] motion-reduce:transition-none motion-reduce:[&_svg]:scale-100'

export function NumberField({
	label,
	value,
	onValueChange,
	description,
	min,
	max,
	step = 1,
	size = 'md',
	locale,
	disabled,
	className,
}: NumberFieldProps) {
	const id = useId()
	const hintId = description ? `${id}-description` : undefined
	return (
		<NumberFieldPrimitive.Root
			id={id}
			value={value}
			onValueChange={next => {
				if (next !== null) {
					onValueChange(next)
				}
			}}
			min={min}
			max={max}
			step={step}
			locale={locale}
			disabled={disabled}
			className={cn('grid min-w-0', sizes[size], className)}
		>
			{/* A scrubbable label says so with its cursor; vertical pans still scroll the page on touch. */}
			<NumberFieldPrimitive.ScrubArea className='mb-2 w-fit max-w-(--nf-width) cursor-ew-resize touch-pan-y select-none'>
				<label
					htmlFor={id}
					className={cn(
						'cursor-ew-resize leading-(--leading-body) font-medium tracking-(--tracking-body) text-(--foreground)',
						size === 'sm' ? 'text-xs' : 'text-sm',
					)}
				>
					{label}
				</label>
			</NumberFieldPrimitive.ScrubArea>
			{/* A hairline shell; focus darkens the border only. */}
			<NumberFieldPrimitive.Group className='flex min-h-(--nf-height) w-[min(100%,var(--nf-width))] items-center gap-0.5 rounded-(--radius-control) border bg-(--surface) p-(--nf-inset) transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:border-(--border-strong) has-[input:focus]:border-(--foreground) data-disabled:bg-(--surface-muted) data-disabled:opacity-50 motion-reduce:transition-none'>
				<NumberFieldPrimitive.Decrement className={stepClass}>
					<Minus size={16} strokeWidth={1.75} aria-hidden='true' />
				</NumberFieldPrimitive.Decrement>
				<NumberFieldPrimitive.Input
					aria-describedby={hintId}
					className='h-full min-w-0 flex-1 bg-transparent text-center text-(length:--nf-text) leading-(--leading-body) font-medium tracking-(--tracking-body) text-(--foreground) tabular-nums caret-(--foreground) outline-none selection:bg-[color-mix(in_oklab,var(--foreground)_16%,transparent)] disabled:cursor-not-allowed'
				/>
				<NumberFieldPrimitive.Increment className={stepClass}>
					<Plus size={16} strokeWidth={1.75} aria-hidden='true' />
				</NumberFieldPrimitive.Increment>
			</NumberFieldPrimitive.Group>
			{description ? (
				<span
					id={hintId}
					className='block max-w-(--nf-width) pt-2 text-xs leading-(--leading-body) tracking-(--tracking-body) text-(--text-muted) tabular-nums'
				>
					{description}
				</span>
			) : null}
		</NumberFieldPrimitive.Root>
	)
}

export default NumberField
