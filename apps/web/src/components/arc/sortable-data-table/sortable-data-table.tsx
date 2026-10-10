'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUp } from 'lucide-react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import type { Transition } from 'motion/react'
import { cn } from '@/lib/utils'
import { motionTokens } from '../lib/motion-tokens'

export type SortDirection = 'asc' | 'desc'
export interface SortState {
	key: string
	direction: SortDirection
}

export interface DataColumn<T> {
	key: string
	label: string
	sortable?: boolean
	render?: (value: unknown, row: T) => ReactNode
	/** Right-aligns the column with tabular numerals. Detected when every value is a number. */
	numeric?: boolean
	/** Fixed width such as 120 or "20%". Other columns are measured once and held, so sorting never reflows them. */
	width?: number | string
}

export interface SortableDataTableProps<T extends Record<string, unknown>> {
	rows: T[]
	columns: DataColumn<T>[]
	rowKey: keyof T | ((row: T) => string)
	caption?: string
	emptyMessage?: string
	/** Sort applied on the first render. */
	defaultSort?: SortState
	onSortChange?: (sort: SortState) => void
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
const isEmpty = (value: unknown) => value == null || value === ''
const comparable = (value: unknown) => (value instanceof Date ? value.getTime() : value)
const blur = (px: number) => `blur(${px}px)`
const enter: Transition = { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }
const instant: Transition = { duration: motionTokens.duration.instant }

// Below 620px (max-[620px]) the table folds: the header becomes a strip of sort controls and each row becomes two lines.
const cell =
	'[--cell-base:var(--surface)] [--cell-fill:var(--cell-base)] bg-(--cell-fill) transition-colors duration-(--duration-standard) ease-(--ease-standard) data-sorted:[--cell-base:var(--column-tint)] data-numeric:text-right data-numeric:tabular-nums motion-reduce:transition-none'

/** The arrow fades in where a column becomes sorted and flips on a spring when the direction changes. */
function SortGlyph({ active, descending, reduced }: { active: boolean; descending: boolean; reduced: boolean }) {
	const rotate = useMotionValue(descending ? 180 : 0)
	const seen = useRef({ active, hiddenAt: -Infinity })
	useLayoutEffect(() => {
		const state = seen.current
		if (active) {
			// Turn only while the arrow is visible; a freshly shown arrow starts pointing the right way.
			const visible = state.active || performance.now() - state.hiddenAt < 160
			if (visible && !reduced) {
				animate(rotate, descending ? 180 : 0, motionTokens.spring.snappy)
			} else {
				rotate.jump(descending ? 180 : 0)
			}
		} else if (state.active) {
			state.hiddenAt = performance.now()
		}
		state.active = active
	}, [active, descending, reduced, rotate])
	const transition: Transition = reduced
		? instant
		: active
			? { opacity: enter, filter: enter, scale: motionTokens.spring.snappy }
			: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] }
	return (
		<span className='relative grid size-4 flex-none place-items-center' aria-hidden='true'>
			<ArrowUp
				className={cn(
					'absolute inset-0 m-auto text-(--text-muted) opacity-0 transition-opacity duration-(--duration-fast) ease-(--ease-standard) motion-reduce:transition-none',
					!active && 'group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60',
				)}
				size={16}
				strokeWidth={1.75}
			/>
			<motion.span
				className='absolute inset-0 grid place-items-center text-(--foreground)'
				style={{ rotate }}
				initial={false}
				animate={
					active
						? { opacity: 1, scale: 1, filter: blur(0) }
						: { opacity: 0, scale: 0.6, filter: blur(motionTokens.blur.subtle) }
				}
				transition={transition}
			>
				<ArrowUp size={16} strokeWidth={1.75} />
			</motion.span>
		</span>
	)
}

export function SortableDataTable<T extends Record<string, unknown>>({
	rows,
	columns,
	rowKey,
	caption = 'Data table',
	emptyMessage = 'No rows to show',
	defaultSort,
	onSortChange,
}: SortableDataTableProps<T>) {
	const reduced = useReducedMotion() ?? false
	const tableRef = useRef<HTMLTableElement>(null)
	const [sort, setSort] = useState<SortState | null>(defaultSort ?? null)
	const [announcement, setAnnouncement] = useState('')

	const sortedRows = useMemo(() => {
		if (!sort) {
			return rows
		}
		return rows
			.map((row, index) => ({ row, index }))
			.toSorted((a, b) => {
				const left = comparable(a.row[sort.key])
				const right = comparable(b.row[sort.key])
				// Empty values stay at the bottom in both directions.
				if (isEmpty(left) || isEmpty(right)) {
					return isEmpty(left) === isEmpty(right) ? a.index - b.index : isEmpty(left) ? 1 : -1
				}
				const result =
					typeof left === 'number' && typeof right === 'number'
						? left - right
						: collator.compare(String(left), String(right))
				return (sort.direction === 'asc' ? result : -result) || a.index - b.index
			})
			.map(entry => entry.row)
	}, [rows, sort])

	const numeric = useMemo(
		() =>
			new Set(
				columns
					.filter(
						column =>
							column.numeric ??
							(rows.some(row => typeof row[column.key] === 'number') &&
								rows.every(row => typeof row[column.key] === 'number' || isEmpty(row[column.key]))),
					)
					.map(column => column.key),
			),
		[columns, rows],
	)
	// Folded rows put the first numeric column beside the name; later numeric columns drop to the detail line.
	const leadNumeric = columns.findIndex(column => numeric.has(column.key))
	const getRowKey = (row: T) => String(typeof rowKey === 'function' ? rowKey(row) : row[rowKey])
	const keys = sortedRows.map(getRowKey)
	const order = keys.join('\u0000')

	// Measure the natural column widths once, then hold them with a fixed layout so nothing reflows while rows move.
	const signature = columns.map(column => column.key).join('\u0000')
	const [locked, setLocked] = useState<{ signature: string; widths: Record<string, number> } | null>(null)
	const widths = locked?.signature === signature ? locked.widths : null
	useLayoutEffect(() => {
		const table = tableRef.current
		if (!table || widths) {
			return
		}
		const measure = () => {
			const total = table.getBoundingClientRect().width
			if (!total || getComputedStyle(table).display !== 'table') {
				return false
			}
			const next: Record<string, number> = {}
			for (const th of table.querySelectorAll<HTMLElement>('thead th[data-key]')) {
				next[th.dataset.key ?? ''] = (th.getBoundingClientRect().width / total) * 100
			}
			setLocked({ signature, widths: next })
			return true
		}
		if (measure()) {
			return
		}
		const observer = new ResizeObserver(() => {
			if (measure()) {
				observer.disconnect()
			}
		})
		observer.observe(table)
		return () => observer.disconnect()
	}, [signature, widths])

	// A still tint under the sorted column fills the gaps that open while rows pass each other.
	const [band, setBand] = useState<{ left: number; width: number } | null>(null)
	const seenSort = useRef(false)
	useLayoutEffect(() => {
		const table = tableRef.current
		const key = sort?.key
		const update = () => {
			const th = key ? table?.querySelector<HTMLElement>(`thead th[data-key="${CSS.escape(key)}"]`) : null
			setBand(current =>
				th
					? current?.left === th.offsetLeft && current.width === th.offsetWidth
						? current
						: { left: th.offsetLeft, width: th.offsetWidth }
					: null,
			)
		}
		update()
		if (!table || !key) {
			return
		}
		// On a phone the header is a scrolling strip of sort controls; keep the active one in view.
		const th = table.querySelector<HTMLElement>(`thead th[data-key="${CSS.escape(key)}"]`)
		const strip = th?.parentElement
		if (th && strip && strip.scrollWidth > strip.clientWidth && getComputedStyle(table).display !== 'table') {
			const bounds = strip.getBoundingClientRect()
			const target = th.getBoundingClientRect()
			const inset = 8
			const shift =
				target.right > bounds.right - inset
					? target.right - bounds.right + inset
					: target.left < bounds.left + inset
						? target.left - bounds.left - inset
						: 0
			if (shift) {
				strip.scrollTo({
					left: strip.scrollLeft + shift,
					behavior: reduced || !seenSort.current ? 'auto' : 'smooth',
				})
			}
		}
		seenSort.current = true
		const observer = new ResizeObserver(update)
		observer.observe(table)
		return () => observer.disconnect()
	}, [reduced, sort?.key, widths])

	function sortBy(column: DataColumn<T>) {
		const next: SortState = {
			key: column.key,
			direction: sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc',
		}
		setSort(next)
		onSortChange?.(next)
		setAnnouncement(`Sorted by ${column.label}, ${next.direction === 'asc' ? 'ascending' : 'descending'}`)
	}

	return (
		<div className='relative w-full max-w-full min-w-0 overflow-hidden rounded-(--radius-control) border bg-(--surface) font-(family-name:--font-body) text-(--foreground) [--column-tint:var(--surface-muted)]'>
			<div className='relative overflow-x-auto overscroll-x-contain max-[620px]:overflow-visible'>
				{band ? (
					<span
						className='pointer-events-none absolute inset-y-0 bg-(--column-tint) max-[620px]:hidden'
						style={{ left: band.left, width: band.width }}
						aria-hidden='true'
					/>
				) : null}
				<table
					ref={tableRef}

					data-fixed={widths ? '' : undefined}
					className='relative z-1 w-full min-w-[560px] border-separate border-spacing-0 text-left text-sm leading-(--leading-body) tracking-(--tracking-body) data-fixed:table-fixed max-[620px]:block max-[620px]:max-w-full max-[620px]:min-w-0'
				>
					<caption className='sr-only'>{caption}</caption>
					<colgroup>
						{columns.map((column, index) => (
							<col
								key={column.key}
								style={{
									width:
										column.width === undefined
											? widths && index > 0
												? `${widths[column.key]}%`
												: undefined
											: typeof column.width === 'number'
												? `${column.width}px`
												: column.width,
								}}
							/>
						))}
					</colgroup>
					<thead className='max-[620px]:block'>
						<tr className='max-[620px]:flex max-[620px]:[scrollbar-width:none] max-[620px]:items-center max-[620px]:gap-1 max-[620px]:overflow-x-auto max-[620px]:border-b max-[620px]:px-2 max-[620px]:py-1'>
							{columns.map(column => {
								const active = sort?.key === column.key
								const sortable = column.sortable !== false
								const isNumeric = numeric.has(column.key)
								return (
									<th
										key={column.key}
										scope='col'

										data-key={column.key}
										data-sorted={active || undefined}
										data-numeric={isNumeric || undefined}
										aria-sort={
											sortable
												? active
													? sort.direction === 'asc'
														? 'ascending'
														: 'descending'
													: 'none'
												: undefined
										}
										className={cn(
											cell,
											'h-9 border-b px-3 text-sm font-medium whitespace-nowrap text-(--text-muted) data-sorted:text-(--foreground)',
											sortable && 'p-0',
											`max-[620px]:block max-[620px]:h-auto max-[620px]:flex-none max-[620px]:border-0 max-[620px]:bg-transparent max-[620px]:p-0`,
										)}
									>
										{sortable ? (
											<button
												type='button'
												onClick={() => sortBy(column)}
												aria-label={`Sort by ${column.label}${active ? `, currently ${sort.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
												className={cn(
													'group/sort flex h-9 w-full items-center px-3 [-webkit-tap-highlight-color:transparent]',
													isNumeric ? 'justify-end' : 'justify-start',
													`max-[620px]:h-8 max-[620px]:w-auto max-[620px]:rounded-(--radius-control) max-[620px]:px-2.5 max-[620px]:transition-colors max-[620px]:duration-(--duration-standard)`,
													active && `max-[620px]:bg-(--surface-muted)`,
												)}
											>
												{/* Right-aligned columns lead with the arrow so the label lines up with the digits below it. */}
												<span
													className={cn(
														'inline-flex items-center gap-1.5 rounded-(--radius-control) transition-colors duration-(--duration-fast) ease-(--ease-standard) group-hover/sort:text-(--foreground) motion-reduce:transition-none',
														isNumeric && `flex-row-reverse max-[620px]:flex-row`,
													)}
												>
													<span>{column.label}</span>
													<SortGlyph
														active={active}
														descending={active && sort.direction === 'desc'}
														reduced={reduced}
													/>
												</span>
											</button>
										) : (
											column.label
										)}
									</th>
								)
							})}
						</tr>
					</thead>
					<tbody className='max-[620px]:block max-[620px]:w-full'>
						{sortedRows.length ? (
							sortedRows.map((row, index) => {
								const key = keys[index]!
								return (
									<motion.tr
										key={key}
										role='row'
										layout={reduced ? false : 'position'}
										layoutDependency={order}
										transition={motionTokens.spring.smooth}
										className="group/row max-[620px]:relative max-[620px]:box-border max-[620px]:flex max-[620px]:min-h-16 max-[620px]:w-full max-[620px]:flex-wrap max-[620px]:content-center max-[620px]:items-baseline max-[620px]:gap-x-2 max-[620px]:gap-y-0.5 max-[620px]:border-b max-[620px]:border-(--border-subtle) max-[620px]:bg-(--surface) max-[620px]:px-4 max-[620px]:py-2.5 max-[620px]:transition-colors max-[620px]:duration-(--duration-standard) max-[620px]:after:order-1 max-[620px]:after:basis-full max-[620px]:after:content-[''] max-[620px]:last:border-b-0 max-[620px]:hover:bg-[color-mix(in_oklab,var(--foreground)_3%,var(--surface))]"
									>
										{columns.map((column, columnIndex) => {
											const isNumeric = numeric.has(column.key)
											const sorted = sort?.key === column.key
											return (
												<td
													key={column.key}

													data-label={column.label}
													data-sorted={sorted || undefined}
													data-numeric={isNumeric || undefined}
													className={cn(
														cell,
														'h-10 border-b border-(--border-subtle) px-3 align-middle font-normal [overflow-wrap:anywhere] text-(--foreground) group-last/row:border-b-0 group-hover/row:[--cell-fill:color-mix(in_oklab,var(--foreground)_3%,var(--cell-base))]',
														`max-[620px]:order-2 max-[620px]:block max-[620px]:h-auto max-[620px]:min-w-0 max-[620px]:border-0 max-[620px]:bg-transparent max-[620px]:p-0 max-[620px]:text-left max-[620px]:text-xs max-[620px]:text-(--text-secondary)`,
														// The sorted value lifts to full contrast, echoing the tinted column on wider screens.
														sorted && `max-[620px]:text-(--foreground)`,
														columnIndex === 0 &&
															`max-[620px]:order-0 max-[620px]:flex-[1_1_0] max-[620px]:text-sm max-[620px]:font-medium max-[620px]:text-(--foreground)`,
														columnIndex > 0 &&
															columnIndex === leadNumeric &&
															`max-[620px]:order-0 max-[620px]:ml-auto max-[620px]:flex-none max-[620px]:pl-2 max-[620px]:text-sm max-[620px]:text-(--foreground)`,
													)}
												>
													{column.render
														? column.render(row[column.key], row)
														: String(row[column.key] ?? '–')}
												</td>
											)
										})}
									</motion.tr>
								)
							})
						) : (
							<tr className='max-[620px]:flex'>
								<td
									className='h-30 text-center text-(--text-muted) max-[620px]:block max-[620px]:h-auto max-[620px]:flex-[1_0_100%] max-[620px]:py-6'
									colSpan={columns.length}
								>
									{emptyMessage}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			<p className='sr-only' role='status'>
				{announcement}
			</p>
		</div>
	)
}

export default SortableDataTable
