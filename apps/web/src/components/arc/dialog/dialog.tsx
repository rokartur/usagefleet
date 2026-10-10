'use client'

import type { ReactNode } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export interface DialogContentProps extends Omit<DialogPrimitive.Popup.Props, 'className' | 'title' | 'children'> {
	title: string
	description?: string
	children: ReactNode
	className?: string
}

/** When the title or description changes while open, the new copy rises in and the old copy leaves upward. */
function SwapText({ text, className }: { text: string; className?: string }) {
	const reduced = useReducedMotion()
	return (
		<AnimatePresence mode='popLayout' initial={false}>
			<motion.span
				key={text}
				className={cn('block', className)}
				initial={reduced ? false : { opacity: 0, y: '0.3em', filter: `blur(${motionTokens.blur.soft}px)` }}
				animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
				exit={
					reduced
						? { opacity: 0, transition: { duration: 0 } }
						: {
								opacity: 0,
								y: '-0.3em',
								filter: `blur(${motionTokens.blur.subtle}px)`,
								transition: {
									duration: motionTokens.duration.fast,
									ease: [...motionTokens.ease.standard],
								},
							}
				}
				transition={{ duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}
			>
				{text}
			</motion.span>
		</AnimatePresence>
	)
}

export function DialogContent({ title, description, children, className, ...props }: DialogContentProps) {
	// The backdrop fades while the dialog rises 8px and scales up on a spring. Closing is shorter and quieter; while the layers leave,
	// clicks pass through, so the trigger can reopen the dialog mid-exit and the transitions reverse from where they are.
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Backdrop className='fixed inset-0 z-50 bg-[oklch(10%_0_0/.46)] backdrop-blur-[7px] transition-opacity duration-(--duration-standard) ease-(--ease-enter) data-ending-style:pointer-events-none data-ending-style:opacity-0 data-ending-style:duration-(--duration-fast) data-ending-style:ease-(--ease-standard) data-starting-style:opacity-0 motion-reduce:duration-(--duration-instant)' />
			{/* Centred with auto margins (like a native modal dialog) so translate and scale stay free for the entrance. */}
			<DialogPrimitive.Popup
				{...props}
				className={cn(
					'fixed inset-0 z-51 m-auto h-fit max-h-[calc(100dvh-var(--space-8))] w-[min(calc(100vw-var(--space-8)),440px)] overflow-auto rounded-(--radius-surface) border bg-(--surface-raised) text-(--foreground) shadow-(--shadow-floating) outline-none [transition:opacity_var(--duration-fast)_var(--ease-enter),translate_var(--duration-spring)_var(--ease-spring),scale_var(--duration-spring)_var(--ease-spring)] data-ending-style:pointer-events-none data-ending-style:translate-y-1 data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:[transition:opacity_var(--duration-fast)_var(--ease-standard),translate_var(--duration-fast)_var(--ease-standard),scale_var(--duration-fast)_var(--ease-standard)] data-starting-style:translate-y-2 data-starting-style:scale-96 data-starting-style:opacity-0 motion-reduce:[transition:opacity_var(--duration-instant)]',
					className,
				)}
			>
				<div className='flex items-start justify-between gap-5 border-b p-6'>
					<div>
						{/* Line height sits on the text itself, so a page-level heading reset cannot pull the close button off the title's line. */}
						<DialogPrimitive.Title className='relative m-0 text-lg leading-(--leading-body) font-medium tracking-(--tracking-body) [overflow-wrap:anywhere]'>
							<SwapText text={title} className='leading-(--leading-body)' />
						</DialogPrimitive.Title>
						{description ? (
							<DialogPrimitive.Description className='relative mt-2 text-sm leading-(--leading-body) [overflow-wrap:anywhere] text-(--text-secondary)'>
								<SwapText text={description} />
							</DialogPrimitive.Description>
						) : null}
					</div>
					{/* A compact icon button: quick press, spring release. The negative margin centres it on the title's first line. */}
					<DialogPrimitive.Close
						className='my-[calc((var(--text-lg)*var(--leading-body)-var(--space-8))/2)] grid size-8 flex-none place-items-center rounded-(--radius-control) border bg-[color-mix(in_oklab,var(--surface-muted)_50%,transparent)] text-(--text-secondary) [transition:background-color_var(--duration-fast)_var(--ease-standard),color_var(--duration-fast)_var(--ease-standard),scale_var(--duration-spring)_var(--ease-spring)] hover:bg-(--surface-muted) hover:text-(--foreground) active:scale-96 active:[transition-duration:var(--duration-fast),var(--duration-fast),var(--duration-instant)] motion-reduce:transition-none motion-reduce:active:scale-100'
						aria-label='Close dialog'
					>
						<X size={16} strokeWidth={1.75} aria-hidden='true' />
					</DialogPrimitive.Close>
				</div>
				<div className='p-6 text-sm leading-(--leading-body)'>{children}</div>
			</DialogPrimitive.Popup>
		</DialogPrimitive.Portal>
	)
}
