import { useState } from 'react'
import { useLocale, useTranslations } from 'use-intl'
import { Accordion } from '@/components/arc/accordion/accordion'
import { Badge } from '@/components/arc/badge/badge'
import { BarChart } from '@/components/arc/bar-chart/bar-chart'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SortableDataTable } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { overrun, Section, UsageBar } from '@/components/usage-ui'
import type { PastWindow, WindowHistoryDTO } from '@/lib/data'
import { formatPct, formatPctNumber, formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'

const KINDS = ['sessions', 'weeks'] as const
type Kind = (typeof KINDS)[number]

/** Chart columns on offer; the largest must not exceed `PAST_WINDOWS` in lib/data.ts. */
const WINDOW_COUNTS = ['4', '8', '16'] as const
type WindowCount = (typeof WINDOW_COUNTS)[number]

/** "Feb 12, 10:00–15:00" for a session, "Feb 5 – Feb 12" for a week.
 *
 *  Pinned to UTC in every locale: these are the boundaries Anthropic's own
 *  windows use, so rendering them in the viewer's zone would shift the label
 *  off the window it names. */
function useWindowLabel(): (w: PastWindow, kind: Kind) => string {
	const locale = useLocale()
	const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
	const timeFmt = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		hourCycle: 'h23',
		minute: '2-digit',
		timeZone: 'UTC',
	})
	return (w, kind) => {
		const start = new Date(w.start)
		const end = new Date(w.end)
		return kind === 'sessions'
			? `${dayFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`
			: `${dayFmt.format(start)} – ${dayFmt.format(end)}`
	}
}

const columnKey = (groupId: string | null) => groupId ?? 'ungrouped'

/** One column per group that was active in any shown window, busiest first. */
function columnsOf(windows: PastWindow[]) {
	const cols = new Map<string, { key: string; name: string; color: string; tokens: number }>()
	for (const w of windows) {
		for (const g of w.groups) {
			const cur = cols.get(columnKey(g.groupId))
			if (cur) {
				cur.tokens += g.tokens
			} else {
				cols.set(columnKey(g.groupId), {
					color: g.color,
					key: columnKey(g.groupId),
					name: g.name,
					tokens: g.tokens,
				})
			}
		}
	}
	return [...cols.values()].toSorted((a, b) => b.tokens - a.tokens)
}

/**
 * Past limit windows, group by group — the "how did last session/week go"
 * counterpart to the live card. Every percentage is a share of the whole
 * account limit: the utilization Claude reported for that window, split across
 * groups by cost, so the group cells sum to the account column. Only that
 * column carries a bar, since group shares are already measured against it.
 * Windows that closed before the collector recorded a utilization sample have
 * no percentage anywhere and fall back to tokens.
 *
 * `account` names the subscription the windows belong to, and is passed only
 * when the fleet reports on more than one.
 */
export function WindowHistory({ history, account }: { history: WindowHistoryDTO; account?: string }) {
	const t = useTranslations('dash.overview')
	const windowLabel = useWindowLabel()
	const [kind, setKind] = useState<Kind>('sessions')
	const [count, setCount] = useState<WindowCount>('8')
	const windows = history[kind].slice(0, Number(count))
	const columns = columnsOf(windows)
	const kindLabel = { sessions: t('windowsSessions'), weeks: t('windowsWeeks') }

	return (
		<Section
			title={account ? t('pastWindowsFor', { account }) : t('pastWindows')}
			actions={
				<div className='flex flex-wrap items-center gap-3'>
					<Tooltip content={t('betaHint')}>
						<Badge tabIndex={0}>{t('beta')}</Badge>
					</Tooltip>
					<SegmentedControl
						label={t('window')}
						value={kind}
						onValueChange={setKind}
						options={KINDS.map(k => ({ label: kindLabel[k], value: k }))}
					/>
					<SegmentedControl
						label={t('windowCount')}
						value={count}
						onValueChange={setCount}
						options={WINDOW_COUNTS.map(n => ({ label: n, value: n }))}
					/>
				</div>
			}
		>
			{windows.length === 0 ? (
				<EmptyState
					title={t('historyEmptyTitle')}
					description={t('historyEmptyDescription', {
						window: kind === 'sessions' ? t('fiveHour') : t('weekly'),
					})}
				/>
			) : (
				<>
					<WindowChart windows={windows} kind={kind} />
					<Accordion
						className='mt-4'
						items={[
							{
								value: 'table',
								title: t('table'),
								content: (
									<SortableDataTable
										caption={t('table')}
										rows={windows.map(w => ({
											accountPct: w.accountPct,
											start: w.start,
											tokens: w.tokens,
											window: w,
										}))}
										rowKey='start'
										columns={[
											{
												key: 'start',
												label: t('windowUtc'),
												render: (_, row) => (
													<span className='font-medium whitespace-nowrap'>
														{windowLabel(row.window, kind)}
													</span>
												),
												sortable: true,
											},
											{
												key: 'accountPct',
												label: t('accountLimit'),
												render: (_, row) =>
													row.accountPct === null ? (
														<span className='text-muted-foreground'>
															{t('noLimitSample')}
														</span>
													) : (
														<span className='flex min-w-36 items-center gap-3'>
															<UsageBar pct={row.accountPct} className='w-24 shrink-0' />
															<span
																className={cn(
																	'font-medium tabular-nums',
																	overrun(row.accountPct),
																)}
															>
																{formatPct(row.accountPct)}
															</span>
														</span>
													),
												sortable: true,
											},
											{
												key: 'tokens',
												label: t('tokens'),
												numeric: true,
												render: (_, row) => formatTokens(row.tokens),
												sortable: true,
											},
											...columns.map(c => ({
												key: c.key,
												label: c.name,
												numeric: true,
												render: (_: unknown, row: { window: PastWindow }) => {
													const g = row.window.groups.find(
														x => columnKey(x.groupId) === c.key,
													)
													return g && g.accountPct !== null ? (
														<span className={cn('font-medium', overrun(g.accountPct))}>
															{formatPct(g.accountPct)}
														</span>
													) : (
														<span className='text-muted-foreground'>
															{g ? formatTokens(g.tokens) : '—'}
														</span>
													)
												},
											})),
										]}
									/>
								),
							},
						]}
					/>
				</>
			)}
		</Section>
	)
}

/** One bar per window, oldest on the left, on a fixed 0–100% scale: each bar is
 *  the account's peak cut into what each group contributed. */
function WindowChart({ windows, kind }: { windows: PastWindow[]; kind: Kind }) {
	const t = useTranslations('dash.overview')
	const locale = useLocale()
	const label = useWindowLabel()
	const short = new Intl.DateTimeFormat(
		locale,
		kind === 'sessions'
			? { hour: '2-digit', hourCycle: 'h23', minute: '2-digit', timeZone: 'UTC', weekday: 'short' }
			: { day: 'numeric', month: 'short', timeZone: 'UTC' },
	)
	const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
	const shown = windows.toReversed()
	const [oldest] = shown
	const [newest] = windows
	const from = day.format(new Date(oldest.start))
	const to = day.format(new Date(newest.end))
	const period = `${from === to ? from : `${from} – ${to}`} UTC`

	return (
		<BarChart
			label={t('accountLimit')}
			period={period}
			unit='%'
			averageLabel={t('average')}
			valueLabel={t('accountLimit')}
			categoryLabel={t('windowUtc')}
			emptyLabel={t('noLimitSample')}
			ticks={[0, 50, 100]}
			height={160}
			formatValue={formatPctNumber}
			data={shown.map(w => ({
				key: w.start,
				label: `${label(w, kind)} UTC`,
				axisLabel: short.format(new Date(w.start)),
				value: w.accountPct,
				segments: w.groups.map(g => ({
					key: columnKey(g.groupId),
					value: g.accountPct ?? 0,
					color: g.color,
				})),
			}))}
		/>
	)
}
