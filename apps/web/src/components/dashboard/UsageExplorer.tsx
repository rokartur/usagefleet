import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useLocale, useTranslations } from 'use-intl'
import { ActivityHeatmap } from '@/components/arc/activity-heatmap/activity-heatmap'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Input } from '@/components/arc/input/input'
import { MultiSelect } from '@/components/arc/multi-select/multi-select'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Select } from '@/components/arc/select/select'
import { Sparkline } from '@/components/arc/sparkline/sparkline'
import { Section } from '@/components/usage-ui'
import type { HistoryDTO, HistoryRow } from '@/lib/data'
import { formatPct, formatTokens, formatUsd } from '@/lib/format'
import { billableTokens, bucketKeys, bucketLabel, daySpan, modelLabel, recordTotal, utcDay } from '@/lib/usage'
import { cn } from '@/lib/utils'

const DAY_MS = 864e5
/** Above this many days the trend switches from daily to monthly points. */
const MAX_DAILY_COLUMNS = 92
const HEATMAP_DAYS = 13 * 7

// Keys only: these are the values the selects round-trip, so they stay stable
// across locales. Their labels come off the catalog at render.
const PERIODS = ['7d', '30d', '90d', 'month', 'today', 'all', 'custom'] as const
type PeriodKey = (typeof PERIODS)[number]

const DIMENSIONS = ['group', 'model', 'device', 'source'] as const
type Dim = (typeof DIMENSIONS)[number]

const METRICS = ['billable', 'total', 'input', 'output', 'cacheRead', 'cost'] as const
type Metric = (typeof METRICS)[number]

/** Catalog key for each select option, so the label lookups stay exhaustive:
 *  adding a period or metric above fails to compile until it is named here. */
const PERIOD_KEY = {
	'7d': 'period7d',
	'30d': 'period30d',
	'90d': 'period90d',
	all: 'periodAll',
	custom: 'periodCustom',
	month: 'periodMonth',
	today: 'periodToday',
} as const satisfies Record<PeriodKey, string>

const DIM_KEY = {
	device: 'dimDevice',
	group: 'dimGroup',
	model: 'dimModel',
	source: 'dimSource',
} as const satisfies Record<Dim, string>

const METRIC_KEY = {
	billable: 'metricBillable',
	cacheRead: 'metricCacheRead',
	cost: 'metricCost',
	input: 'metricInput',
	output: 'metricOutput',
	total: 'metricTotal',
} as const satisfies Record<Metric, string>

/** Series colors for dimensions that carry no color of their own (model /
 *  device / source); groups use their configured color. */
const PALETTE = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']
const SOURCE_LABEL: Record<string, string> = {
	cli: 'Claude Code',
	desktop: 'Claude Desktop',
	pi: 'pi',
	jcode: 'jcode',
	pj: 'pj',
	agent: 'agent',
}

const daysAgo = (n: number) => utcDay(new Date(Date.now() - n * DAY_MS))

/** [from, to] day-key bounds (inclusive); "custom" uses the date inputs. */
function periodBounds(key: PeriodKey, from: string, to: string): [string, string] {
	const today = utcDay(new Date())
	switch (key) {
		case 'today': {
			return [today, today]
		}
		case '7d': {
			return [daysAgo(6), today]
		}
		case '30d': {
			return [daysAgo(29), today]
		}
		case '90d': {
			return [daysAgo(89), today]
		}
		case 'month': {
			return [`${today.slice(0, 7)}-01`, today]
		}
		case 'all': {
			return ['0000-01-01', today]
		}
		case 'custom': {
			return [from || '0000-01-01', to || today]
		}
	}
}

function metricValue(r: HistoryRow, m: Metric): number {
	switch (m) {
		case 'cost': {
			return r.costUsd
		}
		case 'billable': {
			return billableTokens(r)
		}
		case 'total': {
			return recordTotal(r)
		}
		case 'input': {
			return r.inputTokens
		}
		case 'output': {
			return r.outputTokens
		}
		case 'cacheRead': {
			return r.cacheReadTokens
		}
	}
}

/** The row's key along one dimension; nulls map to the usual sentinels. */
function keyOf(r: HistoryRow, dim: Dim): string {
	switch (dim) {
		case 'group': {
			return r.groupId ?? 'ungrouped'
		}
		case 'model': {
			return r.model ?? 'unknown'
		}
		case 'device': {
			return r.deviceId ?? 'unknown'
		}
		case 'source': {
			return r.source ?? 'cli'
		}
	}
}

const formatMetric = (v: number, m: Metric) => (m === 'cost' ? formatUsd(v) : formatTokens(v))

/** The period at a glance: 13 weeks of daily rhythm and four headline figures, then one row per
 *  series with its trend, share and change against the period before. Narrowing to certain
 *  groups/models/devices/sources goes through one palette, so an unfiltered
 *  dashboard shows no filter UI at all — active filters are the only thing that
 *  takes up room, one chip per dimension. */
export function UsageExplorer({ history }: { history: HistoryDTO }) {
	const t = useTranslations('dash.usage')
	const locale = useLocale()
	const [period, setPeriod] = useState<PeriodKey>('30d')
	const [from, setFrom] = useState('')
	const [to, setTo] = useState('')
	const [dim, setDim] = useState<Dim>('group')
	const [metric, setMetric] = useState<Metric>('billable')
	const [filters, setFilters] = useState<Record<Dim, string[]>>({
		device: [],
		group: [],
		model: [],
		source: [],
	})

	const groupName = new Map(history.groups.map(g => [g.id, g.name]))
	// Revoked machines still own their history, and a name gets reused when one is
	// re-enrolled, so the suffix is what tells the two entries apart.
	const deviceName = new Map(
		history.devices.map(d => [d.id, d.revoked ? t('revokedDevice', { name: d.name }) : d.name]),
	)
	const label = (d: Dim, key: string): string => {
		switch (d) {
			case 'group': {
				return key === 'ungrouped' ? t('ungrouped') : (groupName.get(key) ?? t('deletedGroup'))
			}
			case 'device': {
				return key === 'unknown' ? t('unknownDevice') : (deviceName.get(key) ?? t('deletedDevice'))
			}
			case 'model': {
				return modelLabel(key === 'unknown' ? null : key)
			}
			case 'source': {
				return SOURCE_LABEL[key] ?? key
			}
		}
	}

	// Every value each dimension takes across the WHOLE history, so the palette
	// keeps offering a value after you filtered it out.
	const dimValues: Record<Dim, string[]> = {
		device: [],
		group: [],
		model: [],
		source: [],
	}
	for (const d of DIMENSIONS) {
		dimValues[d] = [...new Set(history.rows.map(r => keyOf(r, d)))].toSorted((a, b) =>
			label(d, a).localeCompare(label(d, b)),
		)
	}
	// A dimension with a single value can't narrow anything, so it stays out of
	// the palette.
	const pickable = DIMENSIONS.filter(d => dimValues[d].length > 1)

	const setFilter = (d: Dim, next: string[]) =>
		// Picking every value is the same as picking none.
		setFilters(f => ({ ...f, [d]: next.length === dimValues[d].length ? [] : next }))
	const matchesFilters = (r: HistoryRow) =>
		DIMENSIONS.every(d => filters[d].length === 0 || filters[d].includes(keyOf(r, d)))
	const filtered = history.rows.filter(matchesFilters)
	const today = utcDay(new Date())

	// The heatmap keeps a fixed 13 weeks whatever the period, so the rhythm reads the same every visit.
	const perDay = new Map<string, number>()
	for (const r of filtered) {
		perDay.set(r.day, (perDay.get(r.day) ?? 0) + metricValue(r, metric))
	}
	const heatmapDays = bucketKeys(daysAgo(HEATMAP_DAYS - 1), today, false).map(date => ({
		date,
		value: perDay.get(date) ?? 0,
	}))

	const view = (() => {
		const [lo, hi] = periodBounds(period, from, to)
		const rows = filtered.filter(r => r.day >= lo && r.day <= hi)
		if (rows.length === 0) {
			return null
		}

		// "All time" / an open-ended custom range starts at the first active day,
		// and no range draws empty columns past today.
		const start = lo === '0000-01-01' ? rows.reduce((m, r) => (r.day < m ? r.day : m), hi) : lo
		const end = hi < today ? hi : today
		const span = daySpan(start, end)
		const monthly = span > MAX_DAILY_COLUMNS

		// The same number of days right before the period. "All time" has none, so it shows no change.
		const startMs = Date.parse(`${start}T00:00:00Z`)
		const prevFrom = utcDay(new Date(startMs - span * DAY_MS))
		const prevTo = utcDay(new Date(startMs - DAY_MS))
		const previous = new Map<string, number>()
		for (const r of filtered) {
			if (r.day >= prevFrom && r.day <= prevTo) {
				const k = keyOf(r, dim)
				previous.set(k, (previous.get(k) ?? 0) + metricValue(r, metric))
			}
		}

		const parts = new Map<string, Map<string, number>>()
		const totals = new Map<string, { cost: number; metric: number; total: number }>()
		const activeDays = new Set<string>()
		for (const r of rows) {
			const k = keyOf(r, dim)
			const bk = monthly ? r.day.slice(0, 7) : r.day
			const bucket = parts.get(bk) ?? new Map<string, number>()
			bucket.set(k, (bucket.get(k) ?? 0) + metricValue(r, metric))
			parts.set(bk, bucket)
			const t = totals.get(k) ?? { cost: 0, metric: 0, total: 0 }
			t.total += recordTotal(r)
			t.cost += r.costUsd
			t.metric += metricValue(r, metric)
			totals.set(k, t)
			activeDays.add(r.day)
		}

		const buckets = bucketKeys(start, end, monthly).map(key => {
			const values = parts.get(key) ?? new Map<string, number>()
			let sum = 0
			for (const v of values.values()) {
				sum += v
			}
			return { key, sum, values }
		})
		const busiest = buckets.reduce((top, b) => (b.sum > top.sum ? b : top))

		const series = [...totals.entries()]
			.toSorted((a, b) => b[1].metric - a[1].metric || b[1].total - a[1].total)
			.map(([key, t]) => ({
				key,
				label: label(dim, key),
				// Palette index comes from the stable dimension order, so a series
				// keeps its color when you change the metric or period.
				color:
					dim === 'group'
						? (history.groups.find(g => g.id === key)?.color ?? 'var(--series-1)')
						: PALETTE[Math.max(0, dimValues[dim].indexOf(key)) % PALETTE.length],
				trend: buckets.map(b => b.values.get(key) ?? 0),
				previous: previous.get(key) ?? 0,
				...t,
			}))

		let sum = { cost: 0, metric: 0, previous: 0 }
		for (const s of series) {
			sum = { cost: sum.cost + s.cost, metric: sum.metric + s.metric, previous: sum.previous + s.previous }
		}
		return { activeDays: activeDays.size, busiest, comparable: lo !== '0000-01-01', monthly, series, span, sum }
	})()

	return (
		<Section
			title={t('title')}
			actions={
				<div className='flex max-w-full flex-wrap items-center gap-2 [&_label]:sr-only'>
					<SegmentedControl
						label={t('period')}
						value={period}
						onValueChange={setPeriod}
						options={PERIODS.map(p => ({
							ariaLabel: t(PERIOD_KEY[p]),
							// The rolling windows read fine as "30d"; the rest keep their words.
							label: p === '7d' || p === '30d' || p === '90d' ? p : t(PERIOD_KEY[p]),
							value: p,
						}))}
					/>
					<Select
						label={t('metric')}
						value={metric}
						onValueChange={setMetric}
						options={METRICS.map(m => ({ label: t(METRIC_KEY[m]), value: m }))}
					/>
					<Select
						label={t('splitBy')}
						value={dim}
						onValueChange={setDim}
						options={DIMENSIONS.map(d => ({
							label: t('splitByDim', { dim: t(DIM_KEY[d]).toLowerCase() }),
							value: d,
						}))}
					/>
				</div>
			}
		>
			<div className='flex flex-col gap-4'>
				{(pickable.length > 0 || period === 'custom') && (
					<div className='flex flex-wrap items-end gap-3'>
						{pickable.map(d => (
							<MultiSelect
								key={d}
								className='w-52'
								label={t(DIM_KEY[d])}
								placeholder={t('allValues')}
								value={filters[d]}
								onValueChange={next => setFilter(d, next)}
								options={dimValues[d].map(key => ({ label: label(d, key), value: key }))}
							/>
						))}
						{period === 'custom' && (
							<>
								<Input
									label={t('from')}
									type='date'
									value={from}
									onChange={e => setFrom(e.target.value)}
									className='w-40'
								/>
								<Input
									label={t('to')}
									type='date'
									value={to}
									onChange={e => setTo(e.target.value)}
									className='w-40'
								/>
							</>
						)}
					</div>
				)}

				<div className='grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start'>
					<ActivityHeatmap
						days={heatmapDays}
						label={t('heatmapLabel', { metric: t(METRIC_KEY[metric]) })}
						formatValue={v => formatMetric(v, metric)}
						lessLabel={t('less')}
						moreLabel={t('more')}
						locale={locale}
					/>
					{view && (
						<dl className='grid grid-cols-2 rounded-(--radius-control) border'>
							<Kpi
								label={t(METRIC_KEY[metric])}
								value={formatMetric(view.sum.metric, metric)}
								context={
									view.comparable ? (
										<>
											<Change now={view.sum.metric} before={view.sum.previous} />{' '}
											{t('vsPreviousDays', { count: view.span })}
										</>
									) : (
										t('perDay', { amount: formatMetric(view.sum.metric / view.span, metric) })
									)
								}
							/>
							<Kpi
								label={t('cost')}
								value={formatUsd(view.sum.cost)}
								context={t('perDay', { amount: formatUsd(view.sum.cost / view.span) })}
								className='border-l'
							/>
							<Kpi
								label={t('activeDays')}
								value={String(view.activeDays)}
								context={t('ofDays', { count: view.span })}
								className='border-t'
							/>
							<Kpi
								label={view.monthly ? t('busiestMonth') : t('busiestDay')}
								value={formatMetric(view.busiest.sum, metric)}
								context={bucketLabel(view.busiest.key)}
								className='border-t border-l'
							/>
						</dl>
					)}
				</div>

				{view ? (
					<table className='w-full border-collapse text-sm tabular-nums'>
						<caption className='sr-only'>{t('splitByDim', { dim: t(DIM_KEY[dim]).toLowerCase() })}</caption>
						<thead className='text-xs text-muted-foreground'>
							<tr className='border-b'>
								<th scope='col' className='py-1.5 pr-3 text-left font-normal'>
									{t(DIM_KEY[dim])}
								</th>
								<th scope='col' className='py-1.5 pr-3 text-left font-normal max-sm:hidden'>
									{view.monthly ? t('trendMonthly') : t('trendDaily')}
								</th>
								<th scope='col' className='py-1.5 pl-3 text-right font-normal'>
									{t(METRIC_KEY[metric])}
								</th>
								<th scope='col' className='py-1.5 pl-3 text-right font-normal'>
									{t('share')}
								</th>
								{view.comparable && (
									<th scope='col' className='py-1.5 pl-3 text-right font-normal max-sm:hidden'>
										{t('vsPrevious')}
									</th>
								)}
								{metric !== 'cost' && (
									<th scope='col' className='py-1.5 pl-3 text-right font-normal max-md:hidden'>
										{t('cost')}
									</th>
								)}
							</tr>
						</thead>
						<tbody>
							{view.series.map(s => (
								<tr key={s.key} className='border-b border-(--border-subtle) last:border-b-0'>
									<th
										scope='row'
										className='max-w-48 truncate py-2 pr-3 text-left font-normal before:mr-2 before:inline-block before:size-2 before:rounded-full before:bg-(--dot)'
										style={{ '--dot': s.color } as CSSProperties}
									>
										{s.label}
									</th>
									<td
										className='py-2 pr-3 max-sm:hidden'
										style={{ '--accent': s.color } as CSSProperties}
									>
										<Sparkline data={s.trend} width={180} height={22} />
									</td>
									<td className='py-2 pl-3 text-right font-medium'>
										{formatMetric(s.metric, metric)}
									</td>
									<td className='py-2 pl-3 text-right text-muted-foreground'>
										{formatPct(view.sum.metric > 0 ? (s.metric / view.sum.metric) * 100 : 0)}
									</td>
									{view.comparable && (
										<td className='py-2 pl-3 text-right max-sm:hidden'>
											<Change now={s.metric} before={s.previous} />
										</td>
									)}
									{metric !== 'cost' && (
										<td className='py-2 pl-3 text-right text-muted-foreground max-md:hidden'>
											{formatUsd(s.cost)}
										</td>
									)}
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
				)}
			</div>
		</Section>
	)
}

function Kpi({
	label,
	value,
	context,
	className,
}: {
	label: string
	value: string
	context: ReactNode
	className?: string
}) {
	return (
		<div className={cn('min-w-0 px-4 py-3', className)}>
			<dt className='truncate text-xs text-muted-foreground'>{label}</dt>
			<dd className='mt-0.5 text-xl font-medium tabular-nums'>{value}</dd>
			<dd className='truncate text-xs text-(--text-muted)'>{context}</dd>
		</div>
	)
}

/** Change against the same number of days just before the period. Neutral colour: red means an overrun elsewhere, and more usage is neither good nor bad. */
function Change({ now, before }: { now: number; before: number }) {
	const t = useTranslations('dash.usage')
	if (before <= 0) {
		return <span className='text-(--text-muted)'>{now > 0 ? t('new') : ''}</span>
	}
	const pct = Math.round((now / before - 1) * 100)
	return <span className='tabular-nums'>{pct > 0 ? `+${pct}%` : `${pct}%`}</span>
}
