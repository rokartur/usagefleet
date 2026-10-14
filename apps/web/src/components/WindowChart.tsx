import { useLocale } from 'use-intl'

interface Reading {
	at: string
	pct: number
}

/** Where along the window a moment falls, and how high a pct sits, both in percent of the plot. */
const xOf = (ms: number, start: number, end: number) => Math.min(100, Math.max(0, ((ms - start) / (end - start)) * 100))
const yOf = (pct: number) => 100 - Math.min(100, Math.max(0, pct))

/** One limit window drawn whole: what was used so far, and, for the session, the
 *  pace run forward to the reset with the next full ten marked on it. Decoration:
 *  the meter around it carries the spoken summary and the reset line the forecast. */
export function WindowChart({
	points,
	pct,
	start,
	end,
	now,
	projection = null,
	nextLabel,
}: {
	points: Reading[]
	pct: number
	start: number
	end: number
	now: number
	projection?: { pct: number; fullAt: string | null; next: Reading | null } | null
	nextLabel?: string
}) {
	const locale = useLocale()
	const nowX = xOf(now, start, end)
	const used = [[0, 100], ...points.map(p => [xOf(Date.parse(p.at), start, end), yOf(p.pct)]), [nowX, yOf(pct)]]
	const line = used.map(([x, y]) => `${x},${y}`).join(' ')
	const fullAt = projection?.fullAt ? Date.parse(projection.fullAt) : null
	const ahead = projection && [
		[nowX, yOf(pct)],
		[fullAt ? xOf(fullAt, start, end) : 100, yOf(projection.pct)],
	]
	const next = projection?.next
	const nextX = next ? xOf(Date.parse(next.at), start, end) : 0
	// A week starts and ends on the same weekday, so its ends read as dates.
	const long = end - start > 24 * 60 * 60 * 1000
	const axis = (ms: number) =>
		new Date(ms).toLocaleString(
			locale,
			long
				? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
				: { hour: '2-digit', minute: '2-digit' },
		)

	return (
		<div className='grid gap-1' aria-hidden>
			<div className='relative h-5 text-xs text-foreground tabular-nums'>
				{next && nextLabel && (
					// Sliding the label back by its own share of the way keeps it inside the card at either end.
					<span
						className='absolute top-0 whitespace-nowrap'
						style={{ left: `${nextX}%`, translate: `-${nextX}%` }}
					>
						{nextLabel}
					</span>
				)}
			</div>
			<div className='relative h-16'>
				<svg
					className='absolute inset-0 size-full overflow-visible'
					viewBox='0 0 100 100'
					preserveAspectRatio='none'
				>
					<rect x={nowX} width={100 - nowX} height={100} className='fill-foreground/[0.03]' />
					<line
						x2={100}
						className='stroke-(--border-strong)'
						strokeDasharray='2 3'
						vectorEffect='non-scaling-stroke'
					/>
					<line y1={100} x2={100} y2={100} className='stroke-border' vectorEffect='non-scaling-stroke' />
					<polygon
						points={`${line} ${nowX},100`}
						className='fill-[color-mix(in_oklab,var(--accent)_12%,transparent)]'
					/>
					<polyline
						points={line}
						className='fill-none stroke-(--accent) stroke-2 [stroke-linejoin:round]'
						vectorEffect='non-scaling-stroke'
					/>
					{ahead && (
						<polyline
							points={ahead.map(([x, y]) => `${x},${y}`).join(' ')}
							className={
								fullAt
									? 'fill-none stroke-(--danger) stroke-[1.5]'
									: 'fill-none stroke-foreground stroke-[1.5]'
							}
							strokeDasharray='3 3'
							vectorEffect='non-scaling-stroke'
						/>
					)}
				</svg>
				<Dot x={nowX} y={yOf(pct)} className='size-2 bg-(--accent)' />
				{next && (
					<Dot x={nextX} y={yOf(next.pct)} className='size-2 border-[1.5px] border-foreground bg-surface' />
				)}
			</div>
			<div className='flex justify-between text-xs text-muted-foreground tabular-nums'>
				<span>{axis(start)}</span>
				{fullAt ? <span className='text-(--danger)'>{axis(fullAt)}</span> : <span>{axis(end)}</span>}
			</div>
		</div>
	)
}

function Dot({ x, y, className }: { x: number; y: number; className: string }) {
	return (
		<span
			className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${className}`}
			style={{ left: `${x}%`, top: `${y}%` }}
		/>
	)
}
