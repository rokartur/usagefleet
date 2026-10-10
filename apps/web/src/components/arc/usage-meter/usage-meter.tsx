'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import {
	AnimatePresence,
	animate,
	cancelFrame,
	frame,
	motion,
	motionValue,
	useInView,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from 'motion/react'
import type { AnimationPlaybackControls, MotionValue, Variants } from 'motion/react'
import { motionTokens } from '../lib/motion-tokens'

const swatch =
	"data-[index='0']:bg-(--accent) data-[index='1']:bg-[color-mix(in_oklab,var(--accent)_62%,var(--surface))] data-[index='2']:bg-[color-mix(in_oklab,var(--accent)_36%,var(--surface))] data-[index='3']:bg-[color-mix(in_oklab,var(--accent)_22%,var(--surface))]"
const styles = {
	meter: 'grid min-w-0 gap-4 text-(--foreground)',
	top: 'flex min-h-7 min-w-0 items-center justify-between gap-3',
	// A long label wraps beside the status mark instead of hiding its end.
	title: 'min-w-0 text-base font-medium leading-(--leading-body) tracking-(--tracking-body) text-balance text-(--foreground)',
	// The status mark hugs its words: its width springs to each message and grows from the right edge, so the text never slides.
	badge: 'group/badge inline-flex h-7 flex-none justify-end overflow-hidden rounded-(--radius-pill) bg-(--surface-muted) text-xs leading-none font-medium text-(--text-secondary) transition-colors duration-(--duration-standard) ease-(--ease-standard) data-[status=near]:bg-[color-mix(in_oklab,var(--warning)_14%,var(--surface))] data-[status=near]:text-(--foreground) data-[status=over]:bg-[color-mix(in_oklab,var(--danger)_12%,var(--surface))] data-[status=over]:text-(--foreground) motion-reduce:transition-none',
	badgeInner: 'inline-flex flex-none items-center gap-1.5 px-3 whitespace-nowrap',
	badgeIcon:
		'grid place-items-center group-data-[status=near]/badge:text-(--warning) group-data-[status=over]/badge:text-(--danger)',
	total: 'm-0 flex min-w-0 items-baseline gap-2',
	amount: 'flex-none font-(family-name:--font-display) text-3xl leading-(--leading-display) font-medium tracking-(--tracking-display)',
	caption: 'min-w-0 flex-1 text-sm text-(--text-secondary)',
	swap: 'relative block min-w-0',
	swapText: 'block truncate',
	// The bar leaves room above and below the track for the limit marker.
	bar: 'relative py-[5px]',
	track: 'relative isolate h-3.5 overflow-hidden rounded-(--radius-pill) bg-[color-mix(in_oklab,var(--foreground)_7%,var(--surface))] [-webkit-tap-highlight-color:transparent]',
	segment: `absolute inset-0 transition-opacity duration-(--duration-fast) ease-(--ease-standard) data-[highlight=off]:opacity-28 motion-reduce:transition-none ${swatch}`,
	// Past the limit the used colours stay, struck through by a hatch; highlighting the overage floods it with the danger colour.
	overflow: 'group/over pointer-events-none absolute inset-0 size-full',
	hatch: 'fill-(--surface)',
	overTint:
		'fill-(--danger) opacity-0 transition-opacity duration-(--duration-fast) ease-(--ease-standard) group-data-[highlight=on]/over:opacity-100 motion-reduce:transition-none',
	limit: 'pointer-events-none absolute inset-y-0 -left-px w-0.5 rounded-[1px] bg-(--foreground)',
	// The legend doubles as the keyboard path: arrow keys move between categories, focus previews one, a press pins it.
	legend: '-mx-2 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-0.5',
	item: 'grid min-w-0 justify-items-start gap-0.5 rounded-[calc(var(--radius-control)-6px)] p-2 text-left [-webkit-tap-highlight-color:transparent] transition-[background-color,opacity] duration-(--duration-fast) ease-(--ease-standard) hover:bg-(--surface-muted) aria-pressed:bg-(--surface-muted) data-[highlight=off]:opacity-45 motion-reduce:transition-none',
	itemHead: 'flex max-w-full min-w-0 items-center gap-2 text-sm leading-(--leading-body) text-(--text-secondary)',
	itemLabel: 'min-w-0 flex-1',
	key: 'grid size-3 flex-none place-items-center',
	swatch: `size-2.5 rounded-[3px] [grid-area:1/1] data-[index=free]:bg-[color-mix(in_oklab,var(--foreground)_7%,var(--surface))] data-[index=free]:shadow-[inset_0_0_0_1px_var(--border-strong)] ${swatch}`,
	keyIcon: 'grid place-items-center text-(--danger) [grid-area:1/1]',
	itemValue: 'flex items-baseline gap-1 pl-5 text-base leading-(--leading-body) font-medium text-(--foreground)',
	itemUnit: 'text-sm font-normal text-(--text-secondary)',
	// A rolling number: each digit is a clipped wheel that feathers at its edges, and new columns open from zero width.
	ticker: 'relative inline-flex items-start whitespace-nowrap tabular-nums select-none',
	column: 'relative -my-(--feather) inline-block overflow-hidden py-(--feather) [--feather:.16em] [mask-image:linear-gradient(to_bottom,transparent,#000_calc(var(--feather)*1.5),#000_calc(100%-var(--feather)*1.5),transparent)]',
	sizer: 'invisible',
	glyph: 'absolute inset-x-0 inset-y-(--feather) text-center',
	symbol: 'inline-block overflow-x-clip',
	srOnly: 'sr-only',
}

export interface UsageMeterSegment {
	/** Stable identity. Keep it the same while the value changes, so the segment re-flows instead of being replaced. */
	id: string
	label: string
	value: number
	/** Any CSS colour. Unset segments take the accent tints, by position. */
	color?: string
}

export interface UsageMeterMessages {
	free: string
	over: string
	almostFull: string
	freeAmount: (amount: string) => string
	overAmount: (amount: string) => string
	usedOf: (used: string, limit: string) => string
	/** Follows the big number while nothing is highlighted. */
	caption: (limit: string) => string
	freeCaption: string
	overCaption: string
	segmentCaption: (label: string, share: number) => string
	byCategory: (label: string) => string
}

const defaultMessages: UsageMeterMessages = {
	free: 'Free',
	over: 'Over limit',
	almostFull: 'Almost full',
	freeAmount: amount => `${amount} free`,
	overAmount: amount => `${amount} over`,
	usedOf: (used, limit) => `${used} of ${limit} used`,
	caption: limit => `of ${limit} used`,
	freeCaption: 'free',
	overCaption: 'over the limit',
	segmentCaption: (label, share) => `in ${label} · ${share}% of plan`,
	byCategory: label => `${label} by category`,
}

/** Use a usage meter for a fixed allowance, such as storage or seats, when people need to see what takes the space and how close they are to the limit. */
export interface UsageMeterProps {
	/** What is measured, such as "Workspace storage". */
	label: string
	/** Used amounts in display order. Up to four read clearly. */
	segments: UsageMeterSegment[]
	/** The plan limit, in the same unit as the segments. */
	limit: number
	unit?: string
	/** Digits after the decimal point. */
	decimals?: number
	/** Share of the limit at which the meter warns that it is almost full. */
	warnAt?: number
	/** BCP 47 tag for the digits, so 62.5 reads 62,5 where that is the convention. */
	locale?: string
	/** Every visible and announced string, for translation. Pass only the ones you change. */
	messages?: Partial<UsageMeterMessages>
}

const { spring, duration, ease, blur } = motionTokens
/** Motion drops inherited velocity on time-defined springs, so values that retarget mid-flight run the same springs written as stiffness and damping. */
const physical = ({ visualDuration, bounce }: { visualDuration: number; bounce: number }, restDelta = 0.001) => {
	const root = (2 * Math.PI) / (visualDuration * 1.2)
	return {
		type: 'spring' as const,
		stiffness: root * root,
		damping: 2 * (1 - bounce) * root,
		restDelta,
		restSpeed: restDelta * 2,
	}
}
const settle = physical(spring.smooth)
const reveal = physical({ visualDuration: duration.considered + 0.1, bounce: 0 })
const turn = physical(spring.smooth)
const fit = physical(spring.morph, 0.01)
/** A segment stops two pixels short of the next, so neighbours read apart without an outline. */
const GAP = 2
const subscribeNothing = () => () => null
/** Reduced motion is only known in the browser, so the first client render matches the server before it takes effect. */
function useReducedMotionSafe() {
	const hydrated = useSyncExternalStore(
		subscribeNothing,
		() => true,
		() => false,
	)
	return { reduced: !!useReducedMotion() && hydrated, hydrated }
}
/** Starts animations on the next frame, so the render that caused them never swallows a spring's first frames. Returns a cleanup. */
function soon(start: () => { stop: () => void }) {
	let controls: { stop: () => void } | null = null
	const run = () => {
		controls = start()
	}
	frame.update(run)
	return () => {
		cancelFrame(run)
		controls?.stop()
	}
}

/** Changed text rises from a soft blur and leaves a little faster than it arrives. Icons cross through a small scale instead. */
const rise: Variants = {
	hidden: (direction: number) => ({
		opacity: 0,
		y: `${0.3 * direction}em`,
		scale: 1,
		filter: `blur(${blur.soft}px)`,
	}),
	shown: {
		opacity: 1,
		y: 0,
		scale: 1,
		filter: 'blur(0px)',
		transition: { duration: duration.standard, ease: [...ease.enter] },
	},
	gone: (direction: number) => ({
		opacity: 0,
		y: `${-0.3 * direction}em`,
		scale: 1,
		filter: `blur(${blur.subtle}px)`,
		transition: { duration: duration.instant, ease: [...ease.standard] },
	}),
}
const pop: Variants = {
	hidden: { opacity: 0, y: 0, scale: 0.6, filter: `blur(${blur.subtle + 1}px)` },
	shown: {
		opacity: 1,
		y: 0,
		scale: 1,
		filter: 'blur(0px)',
		transition: {
			...spring.snappy,
			opacity: { duration: duration.fast, ease: [...ease.enter] },
			filter: { duration: duration.fast, ease: [...ease.enter] },
		},
	},
	gone: {
		opacity: 0,
		y: 0,
		scale: 0.6,
		filter: `blur(${blur.subtle + 1}px)`,
		transition: { duration: duration.instant, ease: [...ease.standard] },
	},
}
const fade: Variants = {
	hidden: { opacity: 0, y: 0, scale: 1, filter: 'blur(0px)' },
	shown: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: duration.fast } },
	gone: { opacity: 0, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: duration.instant } },
}

function Swap({ text, reduced, direction = 1 }: { text: string; reduced: boolean; direction?: number }) {
	return (
		<span className={styles.swap}>
			<AnimatePresence mode='popLayout' initial={false} custom={direction}>
				<motion.span
					key={text}
					className={styles.swapText}
					custom={direction}
					variants={reduced ? fade : rise}
					initial='hidden'
					animate='shown'
					exit='gone'
				>
					{text}
				</motion.span>
			</AnimatePresence>
		</span>
	)
}

type Part = { key: string; digit: number } | { key: string; text: string }
const formats = new Map<string, Intl.NumberFormat>()
function numberFormat(decimals: number, locale: string) {
	const key = `${locale}:${decimals}`
	let format = formats.get(key)
	if (!format) {
		format = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
		formats.set(key, format)
	}
	return format
}
/** Split a number into columns keyed by place value, so 9.8 → 10.4 keeps the ones column the ones column and a new tens column slides in. */
function partsFor(value: number, decimals: number, locale: string): Part[] {
	const format = numberFormat(decimals, locale)
	const parts = format.formatToParts(value)
	let place = parts.reduce((count, part) => count + (part.type === 'integer' ? part.value.length : 0), 0)
	let fraction = 0
	return parts.flatMap((part, index): Part[] => {
		if (part.type === 'integer') {
			return [...part.value].map(char => ({ key: `i${--place}`, digit: Number(char) }))
		}
		if (part.type === 'fraction') {
			return [...part.value].map(char => ({ key: `f${fraction++}`, digit: Number(char) }))
		}
		return [
			{
				key: part.type === 'group' ? `g${place}` : part.type === 'decimal' ? 'd' : `${part.type}${index}`,
				text: part.value,
			},
		]
	})
}
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** One digit on a wheel; its distance from the wheel position sets where it sits and how clearly it shows. */
function Glyph({ position, digit }: { position: MotionValue<number>; digit: number }) {
	const offset = useTransform(position, current => ((((digit - current) % 10) + 15) % 10) - 5)
	const y = useTransform(offset, current => `${current}em`)
	const opacity = useTransform(offset, current => Math.max(0, 1 - Math.abs(current)))
	const filter = useTransform(offset, current =>
		Math.abs(current) < 0.02 || Math.abs(current) >= 1
			? 'none'
			: `blur(${(Math.abs(current) * blur.subtle).toFixed(2)}px)`,
	)
	return (
		<motion.span className={styles.glyph} style={{ y, opacity, filter }}>
			{digit}
		</motion.span>
	)
}

const column = {
	initial: { width: 0, opacity: 0 },
	animate: { width: 'auto', opacity: 1 },
	exit: { width: 0, opacity: 0 },
}

/** A digit wheel that always turns the way the whole number moved, wrapping 9 → 0 like an odometer. */
function Column({ digit, direction, reduced }: { digit: number; direction: number; reduced: boolean }) {
	const position = useMotionValue(digit)
	const wheel = useRef({ digit, target: digit })
	const running = useRef<(() => void) | null>(null)
	useEffect(() => () => running.current?.(), [])
	useEffect(() => {
		const state = wheel.current
		if (state.digit === digit) {
			return
		}
		state.target += direction < 0 ? -((state.digit - digit + 10) % 10) : (digit - state.digit + 10) % 10
		state.digit = digit
		running.current?.()
		if (reduced) {
			position.jump(state.target)
			running.current = null
			return
		}
		const target = state.target
		running.current = soon(() => animate(position, target, turn))
	}, [digit, direction, position, reduced])
	return (
		<motion.span className={styles.column} {...column} transition={reduced ? { duration: 0 } : fit}>
			<span className={styles.sizer}>0</span>
			{DIGITS.map(item => (
				<Glyph key={item} position={position} digit={item} />
			))}
		</motion.span>
	)
}

/** A number that rolls to each new value. It is decoration over text that screen readers get elsewhere. */
function Ticker({
	value,
	decimals,
	locale,
	reduced,
}: {
	value: number
	decimals: number
	locale: string
	reduced: boolean
}) {
	const [trend, setTrend] = useState({ value, direction: 1 })
	if (trend.value !== value) {
		setTrend({ value, direction: value > trend.value ? 1 : -1 })
	}
	return (
		<span className={styles.ticker} aria-hidden='true'>
			<AnimatePresence initial={false}>
				{partsFor(value, decimals, locale).map(part =>
					'digit' in part ? (
						<Column key={part.key} digit={part.digit} direction={trend.direction} reduced={reduced} />
					) : (
						<motion.span
							key={part.key}
							className={styles.symbol}
							{...column}
							transition={reduced ? { duration: 0 } : fit}
						>
							{part.text}
						</motion.span>
					),
				)}
			</AnimatePresence>
		</span>
	)
}

type Status = 'ok' | 'near' | 'over'

/** The plan status as a compact mark. Its width springs to each new message and the warning icon grows in beside the words. */
function StatusBadge({ status, text, reduced }: { status: Status; text: string; reduced: boolean }) {
	const inner = useRef<HTMLSpanElement>(null)
	const width = useMotionValue<number | 'auto'>('auto')
	useLayoutEffect(() => {
		const node = inner.current
		if (!node || typeof ResizeObserver === 'undefined') {
			return
		}
		let measured = false
		const observer = new ResizeObserver(() => {
			const next = node.offsetWidth
			if (measured && !reduced) {
				animate(width, next, fit)
			} else {
				width.jump(next)
			}
			measured = next > 0
		})
		observer.observe(node)
		return () => observer.disconnect()
	}, [reduced, width])
	const Icon = status === 'over' ? TriangleAlert : CircleAlert
	return (
		<motion.span className={styles.badge} data-status={status} style={{ width }}>
			<span ref={inner} className={styles.badgeInner}>
				<AnimatePresence mode='popLayout' initial={false}>
					{status !== 'ok' && (
						<motion.span
							key={status}
							className={styles.badgeIcon}
							variants={reduced ? fade : pop}
							initial='hidden'
							animate='shown'
							exit='gone'
						>
							<Icon size={14} strokeWidth={2} aria-hidden='true' />
						</motion.span>
					)}
				</AnimatePresence>
				<Swap text={text} reduced={reduced} />
			</span>
		</motion.span>
	)
}

function Segment({
	index,
	color,
	amounts,
	span,
	width,
	highlight,
}: {
	index: number
	color?: string
	amounts: MotionValue<number>[]
	span: MotionValue<number>
	width: MotionValue<number>
	highlight: 'on' | 'off' | undefined
}) {
	// Each segment starts where the ones before it end, so growth in any of them pushes the rest along in the same frame.
	const x = useTransform(() => {
		let start = 0
		for (let at = 0; at < index; at++) {
			start += amounts[at]!.get()
		}
		return (start / span.get()) * width.get()
	})
	const scaleX = useTransform(() => {
		const w = width.get()
		if (!w) {
			return 0
		}
		const size = (amounts[index]!.get() / span.get()) * w
		const rest = w - x.get() - size
		return Math.max(0, size - Math.min(GAP, size, Math.max(0, rest))) / w
	})
	return (
		<motion.span
			className={styles.segment}
			data-index={index}
			data-highlight={highlight}
			style={{ x, scaleX, originX: 0, background: color }}
		/>
	)
}

export function UsageMeter({
	label,
	segments,
	limit,
	unit = '',
	decimals = 1,
	warnAt = 0.9,
	locale = 'en-US',
	messages: overrides,
}: UsageMeterProps) {
	const messages = { ...defaultMessages, ...overrides }
	const { reduced, hydrated } = useReducedMotionSafe()
	const root = useRef<HTMLDivElement>(null)
	const trackRef = useRef<HTMLDivElement>(null)
	const inView = useInView(root, { once: true, amount: 0.4 })
	const titleId = useId()
	const hatchId = `hatch${titleId.replaceAll(/[^a-zA-Z0-9_-]/g, '')}`
	const ready = hydrated && (inView || reduced)
	const round = (value: number) => Math.round(value * 10 ** decimals) / 10 ** decimals
	const total = round(segments.reduce((sum, segment) => sum + segment.value, 0))
	const free = round(Math.max(0, limit - total))
	const over = round(Math.max(0, total - limit))
	const status: Status = total > limit ? 'over' : total >= limit * warnAt ? 'near' : 'ok'
	// A word unit takes a space ("12 GB"); a symbol hugs the number ("41%").
	const unitSuffix = unit ? (/^\p{L}/u.test(unit) ? ` ${unit}` : unit) : ''
	const format = (value: number) => `${numberFormat(decimals, locale).format(value)}${unitSuffix}`
	const limitText = `${new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(limit)}${unitSuffix}`

	// One motion value per segment id, kept across renders so a changed value springs from where it is.
	const [store] = useState(() => new Map<string, MotionValue<number>>())
	const amounts = segments.map(segment => {
		let value = store.get(segment.id)
		if (!value) {
			value = motionValue(0)
			store.set(segment.id, value)
		}
		return value
	})
	const shownLimit = useMotionValue(limit)
	const width = useMotionValue(0)
	const used = useTransform(() => amounts.reduce((sum, amount) => sum + amount.get(), 0))
	// The bar spans the limit, or everything used once that is more; both follow their springs, so crossing the limit is continuous.
	const span = useTransform(() => Math.max(shownLimit.get(), used.get(), 1e-6))
	const limitX = useTransform(() => Math.round((shownLimit.get() / span.get()) * width.get()))
	// The limit marker and the hatch fade on their own short tween whenever usage crosses the limit, so a limit that jumps past usage never blinks them out in one frame.
	const markerOpacity = useMotionValue(0)
	useEffect(() => {
		let over = used.get() > shownLimit.get()
		markerOpacity.jump(over ? 1 : 0)
		let fading: AnimationPlaybackControls | undefined
		const check = () => {
			const next = used.get() > shownLimit.get()
			if (next === over) {
				return
			}
			over = next
			fading?.stop()
			if (reduced) {
				markerOpacity.jump(next ? 1 : 0)
			} else {
				fading = animate(markerOpacity, next ? 1 : 0, { duration: duration.fast, ease: [...ease.standard] })
			}
		}
		const stops = [used.on('change', check), shownLimit.on('change', check)]
		return () => {
			for (const stop of stops) {
				stop()
			}
			fading?.stop()
		}
	}, [markerOpacity, reduced, shownLimit, used])
	const overClip = useTransform(() => `inset(0 0 0 ${limitX.get() + GAP}px)`)

	useLayoutEffect(() => {
		const node = trackRef.current
		if (!node) {
			return
		}
		width.set(node.clientWidth)
		if (typeof ResizeObserver === 'undefined') {
			return
		}
		const observer = new ResizeObserver(() => width.set(node.clientWidth))
		observer.observe(node)
		return () => observer.disconnect()
	}, [width])

	// Segments grow into place once seen, left to right; later changes re-flow every segment on one spring each.
	const values = segments.map(segment => `${segment.id}:${segment.value}`).join('|')
	const revealed = useRef(false)
	useEffect(() => {
		if (!ready) {
			return
		}
		const first = !revealed.current
		revealed.current = true
		const stops = segments.map((segment, index) => {
			const amount = store.get(segment.id)
			if (!amount || amount.get() === segment.value) {
				return null
			}
			if (reduced) {
				amount.jump(segment.value)
				return null
			}
			return soon(() => animate(amount, segment.value, first ? { ...reveal, delay: index * 0.07 } : settle))
		})
		return () => {
			for (const stop of stops) {
				stop?.()
			}
		}
		// `values` carries every segment id and value, so `segments` itself is left out on purpose.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [values, ready, reduced, store])
	useEffect(() => {
		if (shownLimit.get() === limit) {
			return
		}
		if (reduced) {
			shownLimit.jump(limit)
			return
		}
		return soon(() => animate(shownLimit, limit, settle))
	}, [limit, reduced, shownLimit])

	// Hover previews a category, focus previews it too, and a press pins it until pressed again or Escape.
	const [hovered, setHovered] = useState<string | null>(null)
	const [focused, setFocused] = useState<string | null>(null)
	const [pinned, setPinned] = useState<string | null>(null)
	const [roving, setRoving] = useState(0)
	const items = [
		...segments.map(segment => ({
			id: segment.id,
			label: segment.label,
			value: segment.value,
			color: segment.color,
		})),
		{
			id: 'free',
			label: status === 'over' ? messages.over : messages.free,
			value: status === 'over' ? over : free,
			color: undefined,
		},
	]
	const active = hovered ?? focused ?? pinned
	const activeItem = items.find(item => item.id === active) ?? null
	const legend = useRef<HTMLDivElement>(null)

	const idAt = (clientX: number) => {
		const rect = trackRef.current?.getBoundingClientRect()
		if (!rect?.width) {
			return null
		}
		const at = ((clientX - rect.left) / rect.width) * Math.max(limit, total)
		// Past the limit the hatch stands for the overage, so pointing there highlights it rather than the category beneath.
		if (at > limit) {
			return 'free'
		}
		let end = 0
		for (const segment of segments) {
			end += segment.value
			if (at <= end) {
				return segment.id
			}
		}
		return 'free'
	}
	const onTrackMove = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === 'mouse') {
			setHovered(idAt(event.clientX))
		}
	}
	const onTrackTap = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== 'mouse') {
			const id = idAt(event.clientX)
			setPinned(current => (current === id ? null : id))
		}
	}
	const onLegendKey = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Escape') {
			if (pinned || focused) {
				event.preventDefault()
				setPinned(null)
			}
			return
		}
		const next = (
			{
				ArrowRight: roving + 1,
				ArrowDown: roving + 1,
				ArrowLeft: roving - 1,
				ArrowUp: roving - 1,
				Home: 0,
				End: items.length - 1,
			} as Record<string, number>
		)[event.key]
		if (next === undefined) {
			return
		}
		event.preventDefault()
		const index = (next + items.length) % items.length
		setRoving(index)
		legend.current?.querySelectorAll<HTMLButtonElement>('button')[index]?.focus()
	}

	const headline = ready ? (activeItem ? activeItem.value : total) : 0
	const share = activeItem ? Math.round((activeItem.value / limit) * 100) : 0
	const caption = activeItem
		? activeItem.id === 'free'
			? `${unit} ${status === 'over' ? messages.overCaption : messages.freeCaption}`
			: `${unit} ${messages.segmentCaption(activeItem.label, share)}`
		: `${unit} ${messages.caption(limitText)}`
	const badge =
		status === 'over'
			? messages.overAmount(format(over))
			: status === 'near'
				? messages.almostFull
				: messages.freeAmount(format(free))
	const summary = `${label}: ${messages.usedOf(format(total), limitText)}. ${segments.map(segment => `${segment.label} ${format(segment.value)}`).join(', ')}. ${status === 'over' ? messages.overAmount(format(over)) : `${messages.freeAmount(format(free))}${status === 'near' ? `, ${messages.almostFull}` : ''}`}.`
	// Status changes are announced, and so is a growing overage; routine changes inside a status stay quiet.
	const notice = status === 'over' ? `over:${over}` : status
	const [announced, setAnnounced] = useState({ notice, message: '' })
	if (announced.notice !== notice) {
		setAnnounced({
			notice,
			message:
				status === 'over'
					? `${messages.overAmount(format(over))}.`
					: status === 'near'
						? `${messages.almostFull}. ${messages.freeAmount(format(free))}.`
						: `${messages.freeAmount(format(free))}.`,
		})
	}

	return (
		<div ref={root} className={styles.meter} role='group' aria-labelledby={titleId} data-status={status}>
			<div className={styles.top}>
				<span id={titleId} className={styles.title}>
					{label}
				</span>
				<StatusBadge status={status} text={badge} reduced={reduced} />
			</div>
			<p className={styles.total}>
				<span className={styles.srOnly}>{messages.usedOf(format(total), limitText)}</span>
				<span className={styles.amount} aria-hidden='true'>
					<Ticker value={headline} decimals={decimals} locale={locale} reduced={reduced} />
				</span>
				<span className={styles.caption} aria-hidden='true'>
					<Swap text={caption} reduced={reduced} />
				</span>
			</p>
			<div className={styles.bar}>
				<div
					ref={trackRef}
					className={styles.track}
					role='img'
					aria-label={summary}
					data-active={active ?? undefined}
					onPointerMove={onTrackMove}
					onPointerLeave={() => setHovered(null)}
					onPointerUp={onTrackTap}
				>
					{segments.map((segment, index) => (
						<Segment
							key={segment.id}
							index={index}
							color={segment.color}
							amounts={amounts}
							span={span}
							width={width}
							highlight={active ? (active === segment.id ? 'on' : 'off') : undefined}
						/>
					))}
					{/* Past the limit the bar is struck through: the overflow keeps its colours, hatched so it reads as over without colour. */}
					<motion.svg
						className={styles.overflow}
						data-highlight={active ? (active === 'free' ? 'on' : 'off') : undefined}
						style={{ clipPath: overClip, opacity: markerOpacity }}
						aria-hidden='true'
						focusable='false'
					>
						<defs>
							<pattern
								id={hatchId}
								width={6}
								height={6}
								patternUnits='userSpaceOnUse'
								patternTransform='rotate(45)'
							>
								<rect width={2.5} height={6} className={styles.hatch} />
							</pattern>
						</defs>
						<rect className={styles.overTint} width='100%' height='100%' />
						<rect width='100%' height='100%' fill={`url(#${hatchId})`} />
					</motion.svg>
				</div>
				<motion.span
					className={styles.limit}
					style={{ x: limitX, opacity: markerOpacity }}
					aria-hidden='true'
				/>
			</div>
			<div
				ref={legend}
				className={styles.legend}
				role='group'
				aria-label={messages.byCategory(label)}
				onKeyDown={onLegendKey}
			>
				{items.map((item, index) => {
					const warning = item.id === 'free' && status === 'over'
					return (
						<button
							key={item.id}
							type='button'
							className={styles.item}
							data-highlight={active ? (active === item.id ? 'on' : 'off') : undefined}
							aria-pressed={pinned === item.id}
							aria-label={`${item.label}, ${format(item.value)}`}
							tabIndex={index === roving ? 0 : -1}
							onClick={() => {
								setRoving(index)
								setPinned(current => (current === item.id ? null : item.id))
							}}
							onFocus={() => {
								setRoving(index)
								setFocused(item.id)
							}}
							onBlur={() => setFocused(null)}
							onPointerEnter={event => {
								if (event.pointerType === 'mouse') {
									setHovered(item.id)
								}
							}}
							onPointerLeave={event => {
								if (event.pointerType === 'mouse') {
									setHovered(null)
								}
							}}
						>
							<span className={styles.itemHead}>
								<span className={styles.key} aria-hidden='true'>
									<AnimatePresence mode='popLayout' initial={false}>
										{warning ? (
											<motion.span
												key='alert'
												className={styles.keyIcon}
												variants={reduced ? fade : pop}
												initial='hidden'
												animate='shown'
												exit='gone'
											>
												<TriangleAlert size={12} strokeWidth={2} />
											</motion.span>
										) : (
											<motion.span
												key='swatch'
												className={styles.swatch}
												data-index={item.id === 'free' ? 'free' : index}
												style={{ background: item.color }}
												variants={reduced ? fade : pop}
												initial='hidden'
												animate='shown'
												exit='gone'
											/>
										)}
									</AnimatePresence>
								</span>
								<span className={styles.itemLabel}>
									<Swap text={item.label} reduced={reduced} />
								</span>
							</span>
							<span className={styles.itemValue}>
								<Ticker value={item.value} decimals={decimals} locale={locale} reduced={reduced} />
								{unit && <span className={styles.itemUnit}>{unit}</span>}
							</span>
						</button>
					)
				})}
			</div>
			<p className={styles.srOnly} aria-live='polite' aria-atomic='true'>
				{announced.message}
			</p>
		</div>
	)
}

export default UsageMeter
