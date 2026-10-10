'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

/** Panels share one grid cell, so the outgoing panel stays in place while the new one slides in from the side of its tab. */
export function Tabs({ className, children, ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root {...props} className={cn('relative grid grid-cols-1', className)}>
			{children}
		</TabsPrimitive.Root>
	)
}

export function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
	return (
		<div className='inline-flex max-w-full min-w-0 [scrollbar-width:none] items-center justify-self-start overflow-x-auto rounded-(--radius-control) border bg-(--surface-muted)'>
			{/* The list owns the stacking context so the gliding highlight passes under every label, not over earlier ones. */}
			<TabsPrimitive.List
				{...props}
				className={cn('relative isolate inline-flex w-max items-center gap-1 p-1', className)}
			>
				{children}
				<TabsPrimitive.Indicator className='absolute top-(--active-tab-top) left-0 -z-1 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) rounded-[calc(var(--radius-control)-3px)] border bg-(--surface) shadow-(--shadow-resting) [transition:translate_var(--duration-spring)_var(--ease-spring),width_var(--duration-spring)_var(--ease-spring)] motion-reduce:transition-none' />
			</TabsPrimitive.List>
		</div>
	)
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			{...props}
			className={cn(
				'relative inline-grid min-h-(--control-height-sm) min-w-22 flex-none place-items-center rounded-[calc(var(--radius-control)-3px)] px-3 text-sm font-medium whitespace-nowrap text-(--text-muted) transition-colors duration-(--duration-fast) ease-(--ease-standard) [-webkit-tap-highlight-color:transparent] hover:text-(--foreground) active:text-(--foreground) data-active:text-(--accent-strong) data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none',
				className,
			)}
		/>
	)
}

export function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel
			{...props}
			className={cn(
				'col-start-1 row-start-2 mt-4 text-sm leading-(--leading-body) text-(--text-secondary) [transition:opacity_var(--duration-fast)_var(--ease-standard),translate_var(--duration-spring)_var(--ease-spring)] data-ending-style:pointer-events-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:data-[activation-direction=left]:translate-x-6 motion-safe:data-starting-style:data-[activation-direction=left]:-translate-x-6 motion-safe:data-ending-style:data-[activation-direction=right]:-translate-x-6 motion-safe:data-starting-style:data-[activation-direction=right]:translate-x-6',
				className,
			)}
		/>
	)
}
