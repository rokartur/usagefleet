'use client'

import { useMemo, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, PointerEvent } from 'react'

export interface ActivityDay {
	/** Calendar day as YYYY-MM-DD. */
	date: string
	value: number
}

export interface ActivityHeatmapProps {
	/** One entry per day, oldest first, no gaps. */
	days: ActivityDay[]
	/** Accessible name for the grid. */
	label: string
	formatValue: (value: number) => string
	lessLabel: string
	moreLabel: string
	locale: string
}

const DAY_MS = 864e5
/** Weeks start on Monday. */
const WEEK_START = 1
const LEVEL_BG = ['bg-(--level-0)', 'bg-(--level-1)', 'bg-(--level-2)', 'bg-(--level-3)', 'bg-(--level-4)']
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** Arc's activity heatmap cut down to one square per day, a shared tooltip and keyboard moves: no selection, legend toggles or reveal wave. */
export function ActivityHeatmap({ days, label, formatValue, lessLabel, moreLabel, locale }: ActivityHeatmapProps) {
	const rootRef = useRef<HTMLDivElement>(null)
	const gridRef = useRef<HTMLDivElement>(null)
	const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null)
	const [focusIndex, setFocusIndex] = useState(days.length - 1)

	const model = useMemo(() => {
		const max = Math.max(0, ...days.map(day => day.value))
		const levels = days.map(day => (day.value <= 0 ? 0 : Math.min(4, Math.ceil((day.value / max) * 4))))
		const start = days.length > 0 ? toUtc(days[0].date) : 0
		const lead = (new Date(start).getUTCDay() - WEEK_START + 7) % 7
		const weeks = Math.ceil((lead + days.length) / 7)
		const monthName = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
		const months: { col: number; label: string }[] = []
		for (const [index, day] of days.entries()) {
			const date = new Date(toUtc(day.date))
			if (index === 0 || date.getUTCDate() === 1) {
				months.push({ col: Math.floor((lead + index) / 7), label: monthName.format(date) })
			}
		}
		// A partial first month keeps its label only when there is room before the next one.
		if (months.length > 1 && months[1].col - months[0].col < 3) {
			months.shift()
		}
		return { levels, lead, weeks, months }
	}, [days, locale])

	const formats = useMemo(
		() => ({
			long: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }),
			short: new Intl.DateTimeFormat(locale, {
				day: 'numeric',
				month: 'short',
				timeZone: 'UTC',
				weekday: 'short',
			}),
			weekday: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }),
		}),
		[locale],
	)

	const show = (cell: HTMLElement) => {
		const root = rootRef.current
		if (!root) {
			return
		}
		const box = root.getBoundingClientRect()
		const rect = cell.getBoundingClientRect()
		setTip({ index: Number(cell.dataset.index), x: rect.left - box.left + rect.width / 2, y: rect.top - box.top })
	}
	const cellOf = (target: EventTarget | null) =>
		target instanceof HTMLElement ? target.closest<HTMLElement>('[data-index]') : null

	const onPointerOver = (event: PointerEvent<HTMLDivElement>) => {
		const cell = cellOf(event.target)
		if (cell) {
			show(cell)
		}
	}
	const onFocus = (event: FocusEvent<HTMLDivElement>) => {
		const cell = cellOf(event.target)
		if (cell) {
			setFocusIndex(Number(cell.dataset.index))
			show(cell)
		}
	}
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const cell = cellOf(event.target)
		if (!cell) {
			return
		}
		if (event.key === 'Escape') {
			setTip(null)
			return
		}
		const index = Number(cell.dataset.index)
		const moves: Record<string, number> = {
			ArrowDown: index + 1,
			ArrowLeft: index - 7,
			ArrowRight: index + 7,
			ArrowUp: index - 1,
			End: days.length - 1,
			Home: 0,
		}
		if (!(event.key in moves)) {
			return
		}
		event.preventDefault()
		const next = Math.min(Math.max(moves[event.key], 0), days.length - 1)
		gridRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus()
	}

	const shown = tip ? days[tip.index] : undefined

	return (
		<div
			ref={rootRef}
			className='relative grid min-w-0 gap-2 [--cell:12px] [--gap:3px] [--level-0:color-mix(in_oklab,var(--foreground)_6.5%,var(--surface))] [--level-1:color-mix(in_oklab,var(--accent)_26%,var(--level-0))] [--level-2:color-mix(in_oklab,var(--accent)_50%,var(--level-0))] [--level-3:color-mix(in_oklab,var(--accent)_76%,var(--level-0))] [--level-4:var(--accent)] [--step:calc(var(--cell)+var(--gap))]'
		>
			{/* Right-to-left scrolling starts a long range at its newest week without script. */}
			<div
				className='-m-1.5 max-w-[calc(100%+--spacing(3))] justify-self-start overflow-x-auto overflow-y-hidden p-1.5 [direction:rtl]'
				onScroll={() => setTip(null)}
			>
				<div className='grid w-max grid-cols-[1.75rem_auto] gap-x-(--gap) gap-y-1 [direction:ltr]'>
					<div className='relative col-start-2 h-4 text-xs leading-4 text-muted-foreground' aria-hidden>
						{model.months.map(month => (
							<span
								key={month.col}
								className='absolute top-0 left-0 whitespace-nowrap'
								style={{ transform: `translateX(calc(${month.col} * var(--step)))` }}
							>
								{month.label}
							</span>
						))}
					</div>
					<div
						className='col-start-1 row-start-2 grid grid-rows-[repeat(7,var(--cell))] gap-y-(--gap) text-xs leading-none text-muted-foreground'
						aria-hidden
					>
						{Array.from({ length: 7 }, (_, row) => {
							const weekday = (row + WEEK_START) % 7
							// January 4, 1970 was a Sunday.
							return (
								<span key={row} className='flex items-center'>
									{weekday % 2 === 1 ? formats.weekday.format(new Date((3 + weekday) * DAY_MS)) : ''}
								</span>
							)
						})}
					</div>
					<div
						ref={gridRef}
						role='grid'
						aria-label={label}
						aria-readonly='true'
						tabIndex={-1}
						className='col-start-2 row-start-2 grid gap-(--gap)'
						onPointerOver={onPointerOver}
						onPointerLeave={() => setTip(null)}
						onFocus={onFocus}
						onBlur={event => {
							if (
								!(event.relatedTarget instanceof Node && gridRef.current?.contains(event.relatedTarget))
							) {
								setTip(null)
							}
						}}
						onKeyDown={onKeyDown}
					>
						{Array.from({ length: 7 }, (_, row) => (
							<div key={row} role='row' className='flex gap-(--gap)'>
								{Array.from({ length: model.weeks }, (_, col) => {
									const index = col * 7 + row - model.lead
									const day = days[index]
									if (!day) {
										return <span key={col} className='size-(--cell) shrink-0' aria-hidden />
									}
									return (
										<span
											key={col}
											role='gridcell'
											data-index={index}
											tabIndex={index === focusIndex ? 0 : -1}
											aria-label={`${formatValue(day.value)}, ${formats.long.format(new Date(toUtc(day.date)))}`}
											className={`block size-(--cell) shrink-0 rounded-[3px] outline-offset-1 transition-colors duration-(--duration-standard) ease-(--ease-standard) hover:outline-[1.5px] hover:outline-[color-mix(in_oklab,var(--foreground)_45%,transparent)] ${LEVEL_BG[model.levels[index]]}`}
										/>
									)
								})}
							</div>
						))}
					</div>
				</div>
			</div>

			<div className='flex items-center justify-end gap-2 text-xs text-muted-foreground' aria-hidden>
				<span>{lessLabel}</span>
				<span className='flex gap-(--gap)'>
					{LEVEL_BG.map(bg => (
						<span key={bg} className={`size-(--cell) rounded-[3px] ${bg}`} />
					))}
				</span>
				<span>{moreLabel}</span>
			</div>

			<div
				className='pointer-events-none absolute top-0 left-0 z-5 -translate-x-1/2 -translate-y-full rounded-(--radius-control) border border-[color-mix(in_oklab,var(--background)_14%,var(--foreground))] bg-(--foreground) px-3 py-1.5 whitespace-nowrap text-(--background) shadow-(--shadow-raised) transition-opacity duration-(--duration-fast) ease-(--ease-standard)'
				style={{ left: tip?.x, opacity: tip ? 1 : 0, top: (tip?.y ?? 0) - 6 }}
				aria-hidden
			>
				{shown && (
					<>
						<span className='block text-sm font-medium tabular-nums'>{formatValue(shown.value)}</span>
						<span className='block text-xs opacity-70'>
							{formats.short.format(new Date(toUtc(shown.date)))}
						</span>
					</>
				)}
			</div>
		</div>
	)
}
