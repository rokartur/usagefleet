'use client'

import type { ReactNode } from 'react'
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Drawer = DrawerPrimitive.Root
export const DrawerTrigger = DrawerPrimitive.Trigger
export const DrawerClose = DrawerPrimitive.Close

export interface DrawerContentProps {
	title: string
	children: ReactNode
	className?: string
}

/** A panel anchored to the left edge. It springs in from that edge, follows a swipe back toward it, and leaves with the
 *  swipe's speed; a press outside or Escape returns it on the shorter tween. Clicks pass through layers on their way out,
 *  so the trigger can reopen it mid-exit. */
export function DrawerContent({ title, children, className }: DrawerContentProps) {
	return (
		<DrawerPrimitive.Portal>
			<DrawerPrimitive.Backdrop className='fixed inset-0 z-50 bg-[oklch(10%_0_0/.38)] opacity-[calc(1-var(--drawer-swipe-progress,0))] backdrop-blur-[4px] transition-opacity duration-(--duration-standard) ease-(--ease-enter) data-ending-style:pointer-events-none data-ending-style:opacity-0 data-ending-style:duration-(--duration-fast) data-ending-style:ease-(--ease-standard) data-starting-style:opacity-0 data-swiping:duration-0 motion-reduce:duration-(--duration-instant)' />
			<DrawerPrimitive.Viewport className='fixed inset-0 z-51 flex items-stretch justify-start'>
				{/* Critically damped, like a sheet spring: it never overshoots past the edge it is anchored to. */}
				<DrawerPrimitive.Popup
					className={cn(
						'flex max-h-dvh w-[min(30rem,calc(100vw-var(--space-4)))] max-w-[100vw] translate-x-(--drawer-swipe-movement-x) flex-col overflow-hidden rounded-r-[22px] border border-l-0 bg-(--surface-raised) text-(--foreground) shadow-(--shadow-floating) outline-none [transition:translate_var(--duration-considered)_cubic-bezier(.32,.72,0,1)] data-ending-style:pointer-events-none data-ending-style:-translate-x-full data-ending-style:[transition-duration:calc(var(--drawer-swipe-strength,1)*var(--duration-standard))] data-starting-style:-translate-x-full data-swiping:[transition-duration:0ms] data-swiping:select-none motion-reduce:[transition:opacity_var(--duration-instant)] motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-ending-style:opacity-0 motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-starting-style:opacity-0 max-sm:rounded-r-[18px]',
						className,
					)}
				>
					<DrawerPrimitive.Content className='flex min-h-0 flex-1 flex-col'>
						<div className='flex flex-none items-start justify-between gap-(--space-5) border-b p-(--space-6) max-sm:p-(--space-5)'>
							<DrawerPrimitive.Title className='m-0 text-lg leading-(--leading-body) font-medium tracking-(--tracking-body)'>
								{title}
							</DrawerPrimitive.Title>
							{/* Centered on the first line of the title rather than its top edge. */}
							<DrawerPrimitive.Close
								className='my-[calc((var(--text-lg)*var(--leading-body)-var(--space-8))/2)] grid size-(--space-8) flex-none place-items-center rounded-(--radius-control) border bg-[color-mix(in_oklab,var(--surface-muted)_65%,transparent)] text-(--text-secondary) [transition:background-color_var(--duration-fast)_var(--ease-standard),color_var(--duration-fast)_var(--ease-standard),scale_var(--duration-spring)_var(--ease-spring)] hover:bg-(--surface-muted) hover:text-(--foreground) active:scale-96 motion-reduce:transition-none motion-reduce:active:scale-100'
								aria-label='Close'
							>
								<X size={16} strokeWidth={1.75} aria-hidden='true' />
							</DrawerPrimitive.Close>
						</div>
						<div className='min-h-0 flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain p-(--space-6) text-sm leading-(--leading-body) max-sm:p-(--space-5)'>
							{children}
						</div>
					</DrawerPrimitive.Content>
				</DrawerPrimitive.Popup>
			</DrawerPrimitive.Viewport>
		</DrawerPrimitive.Portal>
	)
}

export default Drawer
