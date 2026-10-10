import { useState } from 'react'
import { useTranslations } from 'use-intl'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Input } from '@/components/arc/input/input'
import { LineChart } from '@/components/arc/line-chart/line-chart'
import { MultiSelect } from '@/components/arc/multi-select/multi-select'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Select } from '@/components/arc/select/select'
import { Section } from '@/components/usage-ui'
import type { HistoryDTO, HistoryRow } from '@/lib/data'
import { formatTokens, formatUsd } from '@/lib/format'
import { billableTokens, bucketKeys, bucketLabel, daySpan, modelLabel, recordTotal, utcDay } from '@/lib/usage'

const DAY_MS = 864e5
/** Above this many days the chart switches from daily to monthly columns. */
const MAX_DAILY_COLUMNS = 92

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

/** Charted, filterable view of the all-time usage history: pick a period, a
 *  metric, and what to split the stack by. Narrowing to certain
 *  groups/models/devices/sources goes through one palette, so an unfiltered
 *  dashboard shows no filter UI at all — active filters are the only thing that
 *  takes up room, one chip per dimension. */
export function UsageExplorer({ history }: { history: HistoryDTO }) {
	const t = useTranslations('dash.usage')
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
	const view = (() => {
		const [lo, hi] = periodBounds(period, from, to)
		const rows = history.rows.filter(
			r =>
				r.day >= lo &&
				r.day <= hi &&
				DIMENSIONS.every(d => filters[d].length === 0 || filters[d].includes(keyOf(r, d))),
		)
		if (rows.length === 0) {
			return null
		}

		// "All time" / an open-ended custom range starts at the first active day,
		// and no range draws empty columns past today.
		const today = utcDay(new Date())
		const start = lo === '0000-01-01' ? rows.reduce((m, r) => (r.day < m ? r.day : m), hi) : lo
		const end = hi < today ? hi : today
		const monthly = daySpan(start, end) > MAX_DAILY_COLUMNS

		const parts = new Map<string, Map<string, number>>()
		const totals = new Map<string, { billable: number; total: number; cost: number; metric: number }>()
		for (const r of rows) {
			const k = keyOf(r, dim)
			const bk = monthly ? r.day.slice(0, 7) : r.day
			const bucket = parts.get(bk) ?? new Map<string, number>()
			bucket.set(k, (bucket.get(k) ?? 0) + metricValue(r, metric))
			parts.set(bk, bucket)
			const t = totals.get(k) ?? { billable: 0, cost: 0, metric: 0, total: 0 }
			t.billable += billableTokens(r)
			t.total += recordTotal(r)
			t.cost += r.costUsd
			t.metric += metricValue(r, metric)
			totals.set(k, t)
		}

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
				...t,
			}))

		const data = bucketKeys(start, end, monthly).map(key => {
			const p = parts.get(key) ?? new Map<string, number>()
			const label = bucketLabel(key)
			return {
				axisLabel: label,
				key,
				label,
				values: Object.fromEntries(series.map(s => [s.key, p.get(s.key) ?? 0])),
			}
		})

		const sum = series.reduce(
			(s, r) => ({
				billable: s.billable + r.billable,
				cost: s.cost + r.cost,
				metric: s.metric + r.metric,
				total: s.total + r.total,
			}),
			{ billable: 0, cost: 0, metric: 0, total: 0 },
		)
		return { data, series, sum }
	})()

	return (
		<Section
			title={t('title')}
			actions={
				<div className='flex flex-wrap items-center gap-2 [&_label]:sr-only'>
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

				{view ? (
					<>
						<LineChart
							label={t('title')}
							categoryLabel={t('period')}
							data={view.data}
							series={view.series.map(s => ({ color: s.color, key: s.key, label: s.label }))}
							formatValue={v => formatMetric(v, metric)}
							formatTick={v => formatMetric(v, metric)}
							// A smooth curve overshoots below zero between a busy day and an idle one.
							curve='linear'
						/>

						{/* Legend with the period's sums. Cost trails each figure unless the
                chart already plots cost. */}
						<ul className='mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-sm'>
							{view.series.length > 1 && (
								<li className='flex items-baseline gap-2'>
									<span className='text-muted-foreground'>{t('tableTotal')}</span>
									<span className='font-medium tabular-nums'>
										{formatMetric(view.sum.metric, metric)}
									</span>
									{metric !== 'cost' && (
										<span className='text-xs text-muted-foreground tabular-nums'>
											{formatUsd(view.sum.cost)}
										</span>
									)}
								</li>
							)}
							{view.series.map(s => (
								<li key={s.key} className='flex min-w-0 items-baseline gap-2'>
									<span
										className='size-2 shrink-0 self-center rounded-full'
										style={{ backgroundColor: s.color }}
										aria-hidden
									/>
									<span className='truncate'>{s.label}</span>
									<span className='font-medium tabular-nums'>{formatMetric(s.metric, metric)}</span>
									{metric !== 'cost' && (
										<span className='text-xs text-muted-foreground tabular-nums'>
											{formatUsd(s.cost)}
										</span>
									)}
								</li>
							))}
						</ul>
					</>
				) : (
					<EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
				)}
			</div>
		</Section>
	)
}
