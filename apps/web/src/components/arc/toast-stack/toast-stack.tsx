'use client'

import { Toast } from '@base-ui/react/toast'
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const useToast = Toast.useToastManager

export const ToastStackProvider = Toast.Provider

const icons = { success: CircleCheck, info: Info, warning: TriangleAlert, error: CircleX }
const iconTone = {
	success: 'text-(--success)',
	info: 'text-(--accent)',
	warning: 'text-(--warning)',
	error: 'text-(--danger)',
}
const isIconType = (type: string | undefined): type is keyof typeof icons => type !== undefined && type in icons

function ToastIcon({ type }: { type: string | undefined }) {
	if (type === 'loading') {
		return (
			<span
				className='mt-0.5 size-4 flex-none animate-spin rounded-full border-[1.5px] border-(--text-muted) border-r-transparent [animation-duration:.7s] motion-reduce:animate-none'
				aria-hidden='true'
			/>
		)
	}
	if (!isIconType(type)) {
		return null
	}
	const Icon = icons[type]
	return <Icon className={cn('mt-0.5 flex-none', iconTone[type])} size={16} strokeWidth={1.75} aria-hidden='true' />
}

// Stacked toasts peek 14px above the front one and shrink 5% per step; hovering or focusing the stack fans them out.
const rootClass =
	"[--gap:12px] [--peek:14px] [--scale:calc(max(0,1-(var(--toast-index)*.05)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] h-(--height) w-full origin-bottom rounded-(--radius-panel) border bg-(--surface-raised) text-(--foreground) shadow-(--shadow-floating) select-none [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_var(--duration-considered)_var(--ease-enter),opacity_var(--duration-standard)_var(--ease-standard),height_var(--duration-fast)_var(--ease-standard),background-color_var(--duration-standard)_var(--ease-standard)] after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] data-behind:bg-(--surface-muted) data-expanded:h-(--toast-height) data-expanded:bg-(--surface-raised) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))] data-limited:opacity-0 data-starting-style:[transform:translateY(150%)] data-ending-style:opacity-0 [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)] data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))] motion-reduce:[transition:opacity_var(--duration-instant)]"

function ToastList() {
	const { toasts } = Toast.useToastManager()
	return toasts.map(toast => (
		<Toast.Root key={toast.id} toast={toast} className={rootClass}>
			{/* Content behind the front toast fades out, so a tall toast never shows through a short one. */}
			<Toast.Content className='flex items-start gap-3 overflow-hidden py-3 pr-2.5 pl-4 transition-opacity duration-(--duration-standard) ease-(--ease-standard) data-behind:opacity-0 data-expanded:opacity-100'>
				<ToastIcon type={toast.type} />
				<div className='grid min-w-0 flex-1 gap-0.5'>
					<Toast.Title className='text-sm leading-(--leading-body) font-medium' />
					<Toast.Description className='text-sm leading-(--leading-body) text-(--text-secondary)' />
				</div>
				<Toast.Close
					className='-my-0.5 grid size-7 flex-none place-items-center rounded-(--radius-control) text-(--text-muted) transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-(--surface-muted) hover:text-(--foreground)'
					aria-label='Dismiss notification'
				>
					<X size={14} strokeWidth={1.75} aria-hidden='true' />
				</Toast.Close>
			</Toast.Content>
		</Toast.Root>
	))
}

export function ToastStack() {
	return (
		<Toast.Portal>
			<Toast.Viewport className='fixed right-6 bottom-6 z-60 w-[min(22.5rem,calc(100%-var(--space-8)))] max-[30rem]:right-4 max-[30rem]:left-4 max-[30rem]:w-auto'>
				<ToastList />
			</Toast.Viewport>
		</Toast.Portal>
	)
}
