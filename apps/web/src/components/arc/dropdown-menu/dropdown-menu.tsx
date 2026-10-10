'use client'

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, ReactNode } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export interface DropdownItem {
	label: string
	onSelect?: () => void
	disabled?: boolean
	icon?: ReactNode
	destructive?: boolean
	separatorBefore?: boolean
	/** Makes the item a checkbox item that shows a check while on; onSelect then toggles it. */ checked?: boolean
}
export interface DropdownMenuProps {
	label: string
	items: DropdownItem[]
	icon?: ReactNode
}

interface Highlight {
	top: number
	height: number
	danger: boolean
	glide: boolean
}

/** A new trigger label rises in while the old one leaves, and the trigger width springs to the measured text instead of snapping. */
function TriggerLabel({ text }: { text: string }) {
	const reduced = useReducedMotion()
	const measure = useRef<HTMLSpanElement>(null)
	const measured = useRef<string | null>(null)
	const [size, setSize] = useState<{ width: number | 'auto'; animate: boolean }>({ width: 'auto', animate: false })
	useLayoutEffect(() => {
		const node = measure.current
		if (!node) {
			return
		}
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) {
				return
			}
			const current = node.textContent
			// Only a text change morphs; the first measure and font swaps settle instantly.
			const animate = measured.current !== null && measured.current !== current
			measured.current = current
			setSize({ width: Math.ceil(entry.borderBoxSize?.[0]?.inlineSize ?? node.offsetWidth), animate })
		})
		observer.observe(node)
		return () => observer.disconnect()
	}, [])
	return (
		<motion.span
			className='relative inline-flex min-w-0 flex-[0_1_auto] overflow-x-clip'
			initial={false}
			animate={{ width: size.width }}
			transition={size.animate && !reduced ? motionTokens.spring.morph : { duration: 0 }}
		>
			<span
				ref={measure}
				className='pointer-events-none invisible absolute top-0 left-0 whitespace-nowrap'
				aria-hidden='true'
			>
				{text}
			</span>
			<AnimatePresence mode='popLayout' initial={false}>
				<motion.span
					key={text}
					className='block min-w-0 truncate'
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
		</motion.span>
	)
}

// Items rise in a beat after one another when the menu opens, capped at the fifth.
const itemClass =
	'relative flex min-h-9 items-center gap-2.5 rounded-[calc(var(--radius-panel)-6px)] px-[11px] text-sm text-(--foreground) outline-none [transition:color_var(--duration-fast)_var(--ease-standard),opacity_var(--duration-standard)_var(--ease-enter)_calc(min(var(--i,0),4)*35ms),translate_var(--duration-standard)_var(--ease-enter)_calc(min(var(--i,0),4)*35ms)] group-data-starting-style/menu:translate-x-[calc(var(--menu-x)*.4)] group-data-starting-style/menu:translate-y-[calc(var(--menu-y)*.4)] group-data-starting-style/menu:opacity-0 data-disabled:cursor-default data-disabled:opacity-45 motion-reduce:transition-none'

export function DropdownMenu({ label, items, icon }: DropdownMenuProps) {
	const reduced = useReducedMotion()
	const [highlight, setHighlight] = useState<Highlight | null>(null)
	const pointer = useRef(false)
	const clearTimer = useRef(0)
	useEffect(() => () => window.clearTimeout(clearTimer.current), [])
	// Base UI focuses the highlighted item (pointer or keyboard) and the popup when the pointer leaves an item.
	function onMenuFocus(event: FocusEvent<HTMLDivElement>) {
		const item =
			event.target instanceof HTMLElement
				? event.target.closest<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')
				: null
		window.clearTimeout(clearTimer.current)
		if (!item) {
			// A short grace period keeps the highlight gliding across separators and item gaps.
			clearTimer.current = window.setTimeout(() => setHighlight(null), pointer.current ? 70 : 0)
			return
		}
		const next = { top: item.offsetTop, height: item.offsetHeight, danger: item.dataset.tone === 'danger' }
		const glide = pointer.current
		setHighlight(current => ({ ...next, glide: glide && current !== null }))
	}
	return (
		<Menu.Root
			onOpenChange={open => {
				if (open) {
					window.clearTimeout(clearTimer.current)
					setHighlight(null)
				}
			}}
		>
			{/* The trigger anchors the menu, so press feedback stays in colour: a scaled rect would shift the menu. */}
			<Menu.Trigger className='group inline-flex min-h-(--control-height-sm) max-w-full items-center gap-2 rounded-(--radius-control) border bg-(--surface) px-3 text-sm font-medium text-(--foreground) [transition:background-color_var(--duration-instant)_var(--ease-standard),border-color_var(--duration-fast)_var(--ease-standard),box-shadow_var(--duration-fast)_var(--ease-standard)] hover:border-(--border-strong) hover:bg-(--surface-muted) hover:shadow-(--shadow-resting) active:border-(--border-strong) active:bg-[color-mix(in_oklab,var(--surface-muted),var(--border)_55%)] active:shadow-none data-popup-open:border-(--border-strong) data-popup-open:bg-(--surface-muted) data-popup-open:shadow-none motion-reduce:transition-none'>
				{icon && (
					<span className='inline-flex flex-none text-(--text-secondary)' aria-hidden='true'>
						{icon}
					</span>
				)}
				<TriggerLabel text={label} />
				<ChevronDown
					className='flex-none text-(--text-muted) [transition:rotate_var(--duration-spring)_var(--ease-spring),color_var(--duration-fast)_var(--ease-standard)] group-data-popup-open:rotate-180 motion-reduce:transition-none'
					size={15}
					strokeWidth={1.8}
					aria-hidden='true'
				/>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner className='z-60' sideOffset={6} align='end' collisionPadding={12}>
					{/* The menu grows from the trigger edge. Transitions instead of keyframes, so a close that interrupts the open reverses from where it is. */}
					<Menu.Popup
						className='group/menu relative max-w-(--available-width) min-w-[min(12rem,var(--available-width))] origin-(--transform-origin) rounded-(--radius-panel) border bg-(--surface-raised) p-[5px] shadow-(--shadow-floating) outline-none [--menu-x:0px] [--menu-y:-5px] [transition:opacity_var(--duration-fast)_var(--ease-enter),translate_var(--duration-spring)_var(--ease-spring),scale_var(--duration-spring)_var(--ease-spring)] data-ending-style:pointer-events-none data-ending-style:translate-x-[calc(var(--menu-x)*.5)] data-ending-style:translate-y-[calc(var(--menu-y)*.5)] data-ending-style:scale-[.985] data-ending-style:opacity-0 data-ending-style:[transition:opacity_130ms_var(--ease-standard),translate_130ms_var(--ease-standard),scale_130ms_var(--ease-standard)] data-starting-style:translate-x-(--menu-x) data-starting-style:translate-y-(--menu-y) data-starting-style:scale-97 data-starting-style:opacity-0 data-[side=left]:[--menu-x:5px] data-[side=left]:[--menu-y:0px] data-[side=right]:[--menu-x:-5px] data-[side=right]:[--menu-y:0px] data-[side=top]:[--menu-y:5px] motion-reduce:[transition:opacity_var(--duration-instant)_linear]'
						onFocus={onMenuFocus}
						onPointerMoveCapture={() => {
							pointer.current = true
						}}
						onKeyDownCapture={() => {
							pointer.current = false
						}}
					>
						{/* One highlight glides between items for the pointer and jumps instantly for the keyboard. */}
						<motion.span
							className='pointer-events-none absolute top-0 right-[5px] left-[5px] rounded-[calc(var(--radius-panel)-6px)] bg-(--surface-muted) opacity-0 transition-colors duration-(--duration-fast) ease-(--ease-standard) data-[tone=danger]:bg-[color-mix(in_oklab,var(--danger)_8%,var(--surface))] motion-reduce:transition-none'
							data-tone={highlight?.danger ? 'danger' : undefined}
							aria-hidden='true'
							initial={false}
							animate={
								highlight ? { y: highlight.top, height: highlight.height, opacity: 1 } : { opacity: 0 }
							}
							transition={{
								default: highlight?.glide && !reduced ? motionTokens.spring.snappy : { duration: 0 },
								opacity: { duration: reduced ? 0 : 0.08 },
							}}
						/>
						{items.map((item, index) => {
							const shared = {
								className: cn(itemClass, item.destructive && 'text-(--danger)'),
								'data-tone': item.destructive ? 'danger' : undefined,
								style: { '--i': index } as CSSProperties,
								disabled: item.disabled,
							}
							const iconClass = cn(
								'inline-flex w-[17px]',
								item.destructive ? 'text-(--danger)' : 'text-(--text-secondary)',
							)
							return (
								<Fragment key={item.label}>
									{item.separatorBefore && (
										<Menu.Separator className='-mx-1 my-1 h-px bg-(--border-subtle)' />
									)}
									{item.checked === undefined ? (
										<Menu.Item {...shared} onClick={() => item.onSelect?.()}>
											{item.icon && (
												<span className={iconClass} aria-hidden='true'>
													{item.icon}
												</span>
											)}
											{item.label}
										</Menu.Item>
									) : (
										<Menu.CheckboxItem
											{...shared}
											checked={item.checked}
											onCheckedChange={() => item.onSelect?.()}
											closeOnClick
										>
											<span className={iconClass} aria-hidden='true'>
												<Menu.CheckboxItemIndicator>
													<Check size={15} strokeWidth={1.8} />
												</Menu.CheckboxItemIndicator>
											</span>
											{item.label}
										</Menu.CheckboxItem>
									)}
								</Fragment>
							)
						})}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	)
}

export default DropdownMenu
