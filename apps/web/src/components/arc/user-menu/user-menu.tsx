'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react'
import { ChevronDown, LoaderCircle, LogOut, Monitor, Moon, Sun, SunMoon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { PanInfo, Transition, Variants } from 'motion/react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export type ThemePreference = 'light' | 'dark' | 'system'

export interface UserMenuMessages {
	menu: (name: string) => string
	theme: string
	themes: Record<ThemePreference, string>
	signOut: string
	signingOut: string
}

/**
 * The account menu behind a person's initials: a compact identity header, an inline theme switch, and sign out. On
 * screens narrower than 640px it opens as a bottom sheet instead. The theme choice keeps the menu open; sign out shows
 * its progress on the item and closes the menu once the promise settles.
 */
export interface UserMenuProps {
	user: { name: string; email: string }
	theme: ThemePreference
	/** Reports the choice. Applying it to the page is up to the app. */
	onThemeChange: (theme: ThemePreference) => void
	onSignOut: () => Promise<unknown>
	messages: UserMenuMessages
	/** Shows the name and a chevron beside the initials from 640px up. */
	showName?: boolean
}

interface Highlight {
	top: number
	height: number
	glide: boolean
}
type OpenReason = 'first' | 'last' | 'pointer' | null

const THEME_ICONS: Record<ThemePreference, ReactNode> = {
	light: <Sun size={14} strokeWidth={1.75} aria-hidden='true' />,
	dark: <Moon size={14} strokeWidth={1.75} aria-hidden='true' />,
	system: <Monitor size={14} strokeWidth={1.75} aria-hidden='true' />,
}
const THEMES: ThemePreference[] = ['light', 'dark', 'system']

const styles = {
	trigger:
		'group/trigger relative inline-flex h-[40px] flex-none cursor-pointer items-center gap-(--space-2) rounded-(--radius-pill) border-0 bg-transparent p-[4px] text-sm tracking-(--tracking-body) text-(--foreground) [-webkit-tap-highlight-color:transparent] transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-(--surface-muted) active:bg-[color-mix(in_oklab,var(--surface-muted),var(--foreground)_8%)] data-[state=open]:bg-(--surface-muted) motion-reduce:transition-none data-name:pr-[10px] max-sm:data-name:pr-[4px]',
	triggerName: 'max-w-[11rem] truncate leading-none font-medium max-sm:hidden',
	chevron:
		'-ml-[2px] flex-none text-(--text-muted) transition-[transform,color] duration-(--duration-spring) ease-(--ease-spring) group-hover/trigger:text-(--foreground) group-data-[state=open]/trigger:rotate-180 group-data-[state=open]/trigger:text-(--foreground) motion-reduce:transition-none max-sm:hidden',
	face: 'grid flex-none place-items-center rounded-(--radius-pill) bg-(--surface-muted) leading-none font-medium text-(--text-secondary) outline-1 -outline-offset-1 outline-[color-mix(in_oklab,var(--foreground)_9%,transparent)] select-none',
	surface:
		'box-border border-[.5px] border-(--border) bg-(--surface-raised) text-left leading-[1.3] tracking-[-.01em] text-(--foreground) shadow-(--shadow-floating) outline-none',
	// The panel scales out of the initials it belongs to; the component sets the origin once it is placed.
	panel: 'fixed top-0 left-0 z-60 w-[15.5rem] max-w-[calc(100vw-24px)] origin-[var(--origin-x,0px)_var(--origin-y,0px)] rounded-[10px] p-(--inset) [--inset:4px] [--row:32px]',
	sheet: 'fixed inset-x-0 bottom-0 z-71 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-(--radius-panel) border-b-0 px-(--inset) pt-[8px] pb-[calc(12px+env(safe-area-inset-bottom))] [--inset:10px] [--row:46px]',
	scrim: 'fixed inset-0 z-70 bg-[oklch(0%_0_0/.32)] [-webkit-tap-highlight-color:transparent]',
	handle: 'mx-auto mb-[10px] block h-[5px] w-[36px] cursor-grab rounded-(--radius-pill) bg-(--border-strong)',
	identity: 'grid min-w-0 flex-1 gap-[2px]',
	name: 'truncate text-[13px] leading-[1.25] font-medium tracking-[-.012em] text-(--foreground)',
	email: 'truncate text-[12px] leading-[1.3] tracking-[-.008em] text-(--text-muted)',
	separator: '-mx-(--inset) my-(--inset) h-px bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)]',
	// One highlight follows the pointer and the keyboard. It is the only hover treatment in the menu.
	highlight:
		'pointer-events-none absolute inset-x-0 top-0 rounded-[6px] bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] opacity-0',
	item: 'group/item relative m-0 box-border flex h-(--row) w-full cursor-pointer items-center gap-[10px] rounded-[6px] border-0 bg-transparent px-[8px] text-left text-(--foreground) outline-none select-none [-webkit-tap-highlight-color:transparent] pointer-coarse:active:bg-(--surface-muted)',
	icon: 'inline-grid w-[16px] flex-none place-items-center text-(--text-secondary) transition-colors duration-(--duration-fast) ease-(--ease-standard) group-focus/item:text-(--foreground) motion-reduce:transition-none',
	itemLabel: 'relative inline-flex min-w-0 flex-1',
	row: 'relative flex items-center gap-[10px] pr-[4px] pl-[8px]',
	// The thumb slides under the icons; the group owns the stacking context.
	segments:
		'relative isolate inline-grid flex-none auto-cols-(--segment) grid-flow-col rounded-[7px] bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)] p-[2px]',
	thumb: 'absolute top-[2px] bottom-[2px] left-[2px] -z-1 w-(--segment) translate-x-[calc(var(--index)*100%)] rounded-[5px] bg-(--surface-raised) shadow-[0_1px_1.5px_oklch(0%_0_0/.08),0_0_0_.5px_color-mix(in_oklab,var(--foreground)_9%,transparent)] transition-transform duration-(--duration-spring) ease-(--ease-spring) motion-reduce:transition-none dark:bg-[color-mix(in_oklab,var(--foreground)_20%,var(--surface-raised))] dark:shadow-none',
	segment:
		'm-0 grid cursor-pointer place-items-center rounded-[5px] border-0 bg-transparent p-0 text-(--text-muted) outline-none [-webkit-tap-highlight-color:transparent] transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:text-(--text-secondary) aria-checked:text-(--foreground) motion-reduce:transition-none',
}

const compactQuery = '(max-width: 639px)'
const subscribeCompact = (change: () => void) => {
	const query = window.matchMedia(compactQuery)
	query.addEventListener('change', change)
	return () => query.removeEventListener('change', change)
}
const subscribeNothing = () => () => null
const enter = [...motionTokens.ease.enter] as [number, number, number, number]
const standard = [...motionTokens.ease.standard] as [number, number, number, number]
const exitEase = [0.4, 0, 1, 1] as [number, number, number, number]

/** The panel grows out of the trigger on a critically damped spring; rows follow a beat later. Closing is a short fade. */
const panelMotion: Variants = {
	closed: { opacity: 0, scale: 0.94 },
	open: {
		opacity: 1,
		scale: 1,
		transition: {
			type: 'spring',
			visualDuration: 0.3,
			bounce: 0,
			opacity: { duration: motionTokens.duration.fast, ease: enter },
			delayChildren: 0.03,
			staggerChildren: 0.016,
		},
	},
	exit: { opacity: 0, scale: 0.97, transition: { duration: motionTokens.duration.instant, ease: exitEase } },
}
const sheetMotion: Variants = {
	closed: { y: '100%' },
	open: {
		y: 0,
		transition: { ...motionTokens.spring.smooth, visualDuration: 0.36, delayChildren: 0.06, staggerChildren: 0.02 },
	},
	exit: { y: '100%', transition: { duration: 0.22, ease: exitEase } },
}
const stillMotion: Variants = {
	closed: { opacity: 0 },
	open: { opacity: 1, transition: { duration: motionTokens.duration.instant } },
	exit: { opacity: 0, transition: { duration: motionTokens.duration.instant } },
}
const rowMotion: Variants = {
	closed: { opacity: 0, y: 3 },
	open: { opacity: 1, y: 0, transition: { duration: 0.2, ease: enter } },
}

function Initials({ name, size }: { name: string; size: 'sm' | 'md' }) {
	const initials = name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map(part => part[0]?.toUpperCase())
		.join('')
	return (
		<span className={cn(styles.face, size === 'sm' ? 'size-[32px] text-[11.5px]' : 'size-[34px] text-[12px]')}>
			{initials}
		</span>
	)
}

/** Changing text rises out of a small blur while the old text lifts away. */
function Rise({ text, reduced }: { text: string; reduced: boolean }) {
	return (
		<AnimatePresence mode='popLayout' initial={false}>
			<motion.span
				key={text}
				className='inline-block whitespace-nowrap'
				initial={
					reduced
						? { opacity: 0 }
						: { opacity: 0, y: '0.35em', filter: `blur(${motionTokens.blur.subtle}px)` }
				}
				animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
				exit={
					reduced
						? { opacity: 0, transition: { duration: 0 } }
						: {
								opacity: 0,
								y: '-0.35em',
								filter: `blur(${motionTokens.blur.subtle}px)`,
								transition: { duration: motionTokens.duration.fast, ease: standard },
							}
				}
				transition={reduced ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: enter }}
			>
				{text}
			</motion.span>
		</AnimatePresence>
	)
}

const getStops = (root: HTMLElement | null) => [...(root?.querySelectorAll<HTMLElement>('[data-stop]') ?? [])]
function focusStop(stop: HTMLElement | undefined) {
	if (!stop) {
		return
	}
	const target =
		stop.dataset.stop === 'group'
			? (stop.querySelector<HTMLElement>('[aria-checked="true"]') ?? stop.querySelector<HTMLElement>('button'))
			: stop
	target?.focus({ preventScroll: true })
}

export function UserMenu({ user, theme, onThemeChange, onSignOut, messages, showName = false }: UserMenuProps) {
	const id = useId()
	const menuId = `${id}-menu`
	const triggerId = `${id}-trigger`
	const reduced = !!useReducedMotion()
	const hydrated = useSyncExternalStore(
		subscribeNothing,
		() => true,
		() => false,
	)
	const compact = useSyncExternalStore(
		subscribeCompact,
		() => window.matchMedia(compactQuery).matches,
		() => false,
	)
	const [open, setOpenState] = useState(false)
	const [signingOut, setSigningOut] = useState(false)
	const [highlight, setHighlight] = useState<Highlight | null>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const surfaceRef = useRef<HTMLDivElement>(null)
	const listRef = useRef<HTMLDivElement>(null)
	const reason = useRef<OpenReason>(null)
	const mounted = useRef(true)
	const pending = useRef(false)
	const sheet = hydrated && compact

	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
		}
	}, [])

	function setOpen(next: boolean, why: OpenReason = null) {
		reason.current = next ? why : null
		if (next) {
			setSigningOut(pending.current)
		}
		setHighlight(null)
		setOpenState(next)
	}
	function close(returnFocus: boolean) {
		setOpen(false)
		if (returnFocus) {
			triggerRef.current?.focus({ preventScroll: true })
		}
	}

	// Focus moves in only when a person opened the menu, so a menu that starts open never steals focus or scrolls the page.
	useEffect(() => {
		if (!open) {
			return
		}
		const why = reason.current
		reason.current = null
		if (!why) {
			return
		}
		const frame = requestAnimationFrame(() => {
			const stops = getStops(listRef.current)
			if (why === 'first') {
				focusStop(stops[0])
			} else if (why === 'last') {
				focusStop(stops.at(-1))
			} else {
				surfaceRef.current?.focus({ preventScroll: true })
			}
		})
		return () => cancelAnimationFrame(frame)
	}, [open, sheet])

	// The panel lines up with the trigger's start edge and scales from the initials, flipping above when there is no room below.
	useLayoutEffect(() => {
		if (!open || sheet) {
			return
		}
		const place = () => {
			const panel = surfaceRef.current
			const trigger = triggerRef.current
			if (!panel || !trigger) {
				return
			}
			const rect = trigger.getBoundingClientRect()
			const width = panel.offsetWidth
			const height = panel.offsetHeight
			const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
			const below = rect.bottom + 8
			const top =
				below + height > window.innerHeight - 12 && rect.top - 8 - height > 12 ? rect.top - 8 - height : below
			panel.style.left = `${left}px`
			panel.style.top = `${top}px`
			const originX = rect.left + Math.min(rect.width, 40) / 2 - left
			panel.style.setProperty('--origin-x', `${Math.min(Math.max(0, originX), width)}px`)
			panel.style.setProperty('--origin-y', top < rect.top ? `${height}px` : '0px')
		}
		place()
		window.addEventListener('resize', place)
		window.addEventListener('scroll', place, true)
		return () => {
			window.removeEventListener('resize', place)
			window.removeEventListener('scroll', place, true)
		}
	}, [open, sheet])

	// Outside presses close the panel. The sheet has its own scrim.
	useEffect(() => {
		if (!open || sheet) {
			return
		}
		const onPointerDown = (event: globalThis.PointerEvent) => {
			const target = event.target
			if (
				target instanceof Node &&
				(surfaceRef.current?.contains(target) || triggerRef.current?.contains(target))
			) {
				return
			}
			reason.current = null
			setHighlight(null)
			setOpenState(false)
		}
		document.addEventListener('pointerdown', onPointerDown, true)
		return () => document.removeEventListener('pointerdown', onPointerDown, true)
	}, [open, sheet])

	// The page behind the sheet stays put.
	useEffect(() => {
		if (!open || !sheet) {
			return
		}
		const root = document.documentElement
		const previous = root.style.overflow
		root.style.overflow = 'hidden'
		return () => {
			root.style.overflow = previous
		}
	}, [open, sheet])

	async function signOut() {
		if (pending.current) {
			return
		}
		// The item keeps its progress while the promise runs, then the menu closes once it settles.
		pending.current = true
		setSigningOut(true)
		try {
			await onSignOut()
		} finally {
			pending.current = false
			if (mounted.current) {
				close(false)
			}
		}
	}

	function onListFocus(event: FocusEvent<HTMLDivElement>) {
		const stop = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-stop]') : null
		if (!stop) {
			setHighlight(null)
			return
		}
		setHighlight(current => ({ top: stop.offsetTop, height: stop.offsetHeight, glide: current !== null }))
	}

	// Focus follows a mouse or pen, so the keyboard carries on from wherever the pointer left the highlight.
	function onItemPointerMove(event: PointerEvent<HTMLElement>) {
		if (event.pointerType === 'touch') {
			return
		}
		if (document.activeElement !== event.currentTarget) {
			event.currentTarget.focus({ preventScroll: true })
		}
	}
	// The inline switch is not a row, so the pointer over it releases the highlight instead of dragging it along.
	function onListPointerMove(event: PointerEvent<HTMLElement>) {
		if (event.pointerType === 'touch' || !highlight) {
			return
		}
		const group =
			event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-stop="group"]') : null
		if (!group || group.contains(document.activeElement)) {
			return
		}
		setHighlight(null)
		surfaceRef.current?.focus({ preventScroll: true })
	}
	function onListPointerLeave(event: PointerEvent<HTMLElement>) {
		if (event.pointerType === 'touch') {
			return
		}
		setHighlight(null)
		surfaceRef.current?.focus({ preventScroll: true })
	}

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		const stops = getStops(listRef.current)
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
		const current = active?.closest<HTMLElement>('[data-stop]') ?? null
		const index = current ? stops.indexOf(current) : -1
		const step = (to: HTMLElement | undefined) => {
			event.preventDefault()
			focusStop(to)
		}
		switch (event.key) {
			case 'ArrowDown': {
				return step(stops[(index + 1) % stops.length])
			}
			case 'ArrowUp': {
				return step(stops[index <= 0 ? stops.length - 1 : index - 1])
			}
			case 'Home': {
				return step(stops[0])
			}
			case 'End': {
				return step(stops.at(-1))
			}
			case 'Escape':
			case 'Tab': {
				event.preventDefault()
				return close(true)
			}
			case 'ArrowLeft':
			case 'ArrowRight': {
				if (current?.dataset.stop !== 'group') {
					return
				}
				event.preventDefault()
				const segments = [...current.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
				const at = Math.max(
					0,
					segments.findIndex(segment => segment.getAttribute('aria-checked') === 'true'),
				)
				const next = segments[(at + (event.key === 'ArrowRight' ? 1 : -1) + segments.length) % segments.length]
				next?.focus({ preventScroll: true })
				next?.click()
			}
		}
	}

	function onTriggerClick(event: MouseEvent<HTMLButtonElement>) {
		if (open) {
			close(false)
			return
		}
		setOpen(true, event.detail === 0 ? 'first' : 'pointer')
	}
	function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
			return
		}
		event.preventDefault()
		setOpen(true, event.key === 'ArrowDown' ? 'first' : 'last')
	}

	function onDragEnd(_: unknown, info: PanInfo) {
		if (info.offset.y > 80 || info.velocity.y > 500) {
			close(true)
		}
	}

	const glide: Transition = highlight?.glide && !reduced ? motionTokens.spring.snappy : { duration: 0 }
	const row = reduced ? undefined : rowMotion
	const menuProps = { id: menuId, role: 'menu', 'aria-labelledby': triggerId, tabIndex: -1, onKeyDown }
	const themeIndex = Math.max(0, THEMES.indexOf(theme))

	const content = (
		<>
			<motion.div
				className={cn('flex items-center gap-[10px]', sheet ? 'px-[8px] pt-[4px] pb-[12px]' : 'p-[8px]')}
				variants={row}
			>
				<Initials name={user.name} size='md' />
				<div className={styles.identity}>
					<span className={styles.name}>{user.name}</span>
					{user.email !== user.name && (
						<span className={styles.email} title={user.email}>
							{user.email}
						</span>
					)}
				</div>
			</motion.div>
			<div
				ref={listRef}
				className='relative'
				onFocus={onListFocus}
				onPointerMove={onListPointerMove}
				onPointerLeave={onListPointerLeave}
			>
				<motion.span
					className={styles.highlight}
					aria-hidden='true'
					initial={false}
					animate={highlight ? { y: highlight.top, height: highlight.height, opacity: 1 } : { opacity: 0 }}
					transition={{ default: glide, opacity: { duration: reduced ? 0 : motionTokens.duration.instant } }}
				/>
				<div className={styles.separator} role='separator' />
				{/* A compact inline switch. It is one stop in the menu: up and down pass over it, left and right choose within it. */}
				<motion.div
					className={cn(styles.row, sheet ? 'h-[52px]' : 'h-[36px]')}
					data-stop='group'
					variants={row}
				>
					<span className={styles.icon} aria-hidden='true'>
						<SunMoon size={16} strokeWidth={1.75} />
					</span>
					<span
						className={cn('flex-1 text-(--foreground)', sheet ? 'text-base' : 'text-[13px]')}
						aria-hidden='true'
					>
						{messages.theme}
					</span>
					<div
						className={cn(
							styles.segments,
							sheet ? 'h-[34px] [--segment:40px]' : 'h-[26px] [--segment:28px]',
						)}
						role='group'
						aria-label={messages.theme}
						style={{ '--index': themeIndex } as CSSProperties}
					>
						<span className={styles.thumb} aria-hidden='true' />
						{THEMES.map(option => (
							<button
								key={option}
								type='button'
								role='menuitemradio'
								tabIndex={-1}
								aria-checked={option === theme}
								aria-label={messages.themes[option]}
								title={messages.themes[option]}
								className={styles.segment}
								onClick={() => onThemeChange(option)}
							>
								{THEME_ICONS[option]}
							</button>
						))}
					</div>
				</motion.div>
				<div className={styles.separator} role='separator' />
				{/* Sign out is not destructive, so it stays neutral like every other row. */}
				<motion.button
					type='button'
					role='menuitem'
					tabIndex={-1}
					className={cn(styles.item, sheet ? 'text-base' : 'text-[13px]')}
					data-stop='item'
					variants={row}
					aria-busy={signingOut || undefined}
					onPointerMove={onItemPointerMove}
					onClick={signOut}
				>
					<span className={styles.icon} aria-hidden='true'>
						{signingOut ? (
							<LoaderCircle className='animate-spin' size={16} strokeWidth={1.75} />
						) : (
							<LogOut size={16} strokeWidth={1.75} />
						)}
					</span>
					<span className={styles.itemLabel}>
						<Rise text={signingOut ? messages.signingOut : messages.signOut} reduced={reduced} />
					</span>
				</motion.button>
			</div>
		</>
	)

	const panel = (
		<AnimatePresence>
			{open && !sheet && (
				<motion.div
					key='panel'
					ref={surfaceRef}
					{...menuProps}
					className={cn(styles.surface, styles.panel)}
					variants={reduced ? stillMotion : panelMotion}
					initial='closed'
					animate='open'
					exit='exit'
				>
					{content}
				</motion.div>
			)}
		</AnimatePresence>
	)

	const bottomSheet = (
		<AnimatePresence>
			{open && sheet && (
				<motion.div
					key='scrim'
					className={styles.scrim}
					aria-hidden='true'
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: reduced ? 0.1 : 0.2, ease: standard }}
					onClick={() => close(true)}
				/>
			)}
			{open && sheet && (
				<motion.div
					key='sheet'
					ref={surfaceRef}
					{...menuProps}
					className={cn(styles.surface, styles.sheet)}
					aria-modal='true'
					variants={reduced ? stillMotion : sheetMotion}
					initial='closed'
					animate='open'
					exit='exit'
					drag={reduced ? false : 'y'}
					dragConstraints={{ top: 0, bottom: 0 }}
					dragElastic={{ top: 0.04, bottom: 0.9 }}
					dragMomentum={false}
					onDragEnd={onDragEnd}
				>
					<span className={styles.handle} aria-hidden='true' />
					{content}
				</motion.div>
			)}
		</AnimatePresence>
	)

	return (
		<span className='relative inline-flex flex-none align-middle'>
			<button
				ref={triggerRef}
				id={triggerId}
				type='button'
				className={styles.trigger}
				data-state={open ? 'open' : 'closed'}
				data-name={showName || undefined}
				aria-haspopup='menu'
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-label={messages.menu(user.name)}
				onClick={onTriggerClick}
				onKeyDown={onTriggerKeyDown}
			>
				<Initials name={user.name} size='sm' />
				{showName && (
					<>
						<span className={styles.triggerName}>{user.name}</span>
						<ChevronDown className={styles.chevron} size={16} strokeWidth={1.75} aria-hidden='true' />
					</>
				)}
			</button>
			{hydrated && createPortal(sheet ? bottomSheet : panel, document.body)}
		</span>
	)
}

export default UserMenu
