import { useState } from 'react'
import { useLocale, useTranslations } from 'use-intl'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { overrun, Section, UsageBar } from '@/components/usage-ui'
import type { PastWindow, WindowHistoryDTO } from '@/lib/data'
import { formatPct, formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'

const KINDS = ['sessions', 'weeks'] as const
type Kind = (typeof KINDS)[number]

/** Chart columns on offer; the largest must not exceed `PAST_WINDOWS` in lib/data.ts. */
const WINDOW_COUNTS = [4, 8, 16] as const
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
	const [count, setCount] = useState<WindowCount>(8)
	const windows = history[kind].slice(0, count)
	const columns = columnsOf(windows)
	const kindLabel = { sessions: t('windowsSessions'), weeks: t('windowsWeeks') }

	return (
		<Section
			title={account ? t('pastWindowsFor', { account }) : t('pastWindows')}
			actions={
				<div className='flex flex-wrap items-center gap-3'>
					<Tooltip>
						<TooltipTrigger className='text-xs text-muted-foreground underline decoration-dotted underline-offset-4'>
							{t('beta')}
						</TooltipTrigger>
						<TooltipContent>{t('betaHint')}</TooltipContent>
					</Tooltip>
					<fieldset className='inline-flex gap-0.5 rounded-lg border p-0.5'>
						<legend className='sr-only'>{t('window')}</legend>
						{KINDS.map(k => (
							<button
								key={k}
								type='button'
								aria-pressed={kind === k}
								onClick={() => setKind(k)}
								className='rounded-md px-2.5 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:text-foreground'
							>
								{kindLabel[k]}
							</button>
						))}
					</fieldset>
					<fieldset className='inline-flex gap-0.5 rounded-lg border p-0.5'>
						<legend className='sr-only'>{t('windowCount')}</legend>
						{WINDOW_COUNTS.map(n => (
							<button
								key={n}
								type='button'
								aria-pressed={count === n}
								onClick={() => setCount(n)}
								className='rounded-md px-2.5 py-1 text-xs text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:text-foreground'
							>
								{n}
							</button>
						))}
					</fieldset>
				</div>
			}
		>
			{windows.length === 0 ? (
				<Empty className='border'>
					<EmptyHeader>
						<EmptyTitle>{t('historyEmptyTitle')}</EmptyTitle>
						<EmptyDescription>
							{t('historyEmptyDescription', {
								window: kind === 'sessions' ? t('fiveHour') : t('weekly'),
							})}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<WindowChart windows={windows} kind={kind} columns={count} />
					<details className='mt-4 text-sm'>
						<summary className='w-max cursor-pointer text-muted-foreground hover:text-foreground'>
							{t('table')}
						</summary>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t('windowUtc')}</TableHead>
									<TableHead>{t('accountLimit')}</TableHead>
									<TableHead className='text-right'>{t('tokens')}</TableHead>
									{columns.map(c => (
										<TableHead key={c.key} className='text-right'>
											<span className='inline-flex items-center gap-2'>
												<span
													className='size-2.5 shrink-0 rounded-full'
													style={{ backgroundColor: c.color }}
													aria-hidden
												/>
												{c.name}
											</span>
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{windows.map(w => (
									<TableRow key={w.start}>
										<TableCell className='font-medium whitespace-nowrap'>
											{windowLabel(w, kind)}
										</TableCell>
										<TableCell>
											{w.accountPct === null ? (
												<span className='text-muted-foreground'>{t('noLimitSample')}</span>
											) : (
												<span className='flex min-w-36 items-center gap-3'>
													<UsageBar pct={w.accountPct} className='w-24 shrink-0' />
													<span
														className={cn(
															'font-medium tabular-nums',
															overrun(w.accountPct),
														)}
													>
														{formatPct(w.accountPct)}
													</span>
												</span>
											)}
										</TableCell>
										<TableCell className='text-right tabular-nums'>
											{formatTokens(w.tokens)}
										</TableCell>
										{columns.map(c => {
											const g = w.groups.find(x => columnKey(x.groupId) === c.key)
											return (
												<TableCell key={c.key} className='text-right tabular-nums'>
													{g && g.accountPct !== null ? (
														<span className={cn('font-medium', overrun(g.accountPct))}>
															{formatPct(g.accountPct)}
														</span>
													) : (
														<span className='text-muted-foreground'>
															{g ? formatTokens(g.tokens) : '—'}
														</span>
													)}
												</TableCell>
											)
										})}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</details>
				</>
			)}
		</Section>
	)
}

/** One column per window, oldest on the left: its height is the account's peak,
 *  cut into what each group contributed, against a 100% line. A window with no
 *  limit sample gets a short hatched stub so the gap reads as missing data.
 *  Always `columns` wide, padded on the left, so few windows don't stretch. */
function WindowChart({ windows, kind, columns }: { windows: PastWindow[]; kind: Kind; columns: number }) {
	const t = useTranslations('dash.overview')
	const locale = useLocale()
	const label = useWindowLabel()
	const short = new Intl.DateTimeFormat(
		locale,
		kind === 'sessions'
			? { hour: '2-digit', hourCycle: 'h23', minute: '2-digit', timeZone: 'UTC', weekday: 'short' }
			: { day: 'numeric', month: 'short', timeZone: 'UTC' },
	)
	const shown = windows.toReversed()

	return (
		<div aria-hidden className='grid gap-1.5' style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
			{Array.from({ length: columns - shown.length }, (_, i) => (
				<div key={`empty-${i}`} className='h-36 border-t border-dashed border-foreground/20' />
			))}
			{shown.map(w => (
				<div
					key={w.start}
					title={`${label(w, kind)} UTC · ${w.accountPct === null ? t('noLimitSample') : formatPct(w.accountPct)}`}
					className='flex min-w-0 flex-col'
				>
					<div className='relative flex h-36 flex-col justify-end border-t border-dashed border-foreground/20'>
						<span
							className={cn(
								'mb-1 text-center text-[11px] text-muted-foreground tabular-nums',
								w.accountPct !== null && overrun(w.accountPct),
							)}
						>
							{w.accountPct === null ? 'n/a' : formatPct(w.accountPct)}
						</span>
						{w.accountPct === null ? (
							<div className='h-3 rounded-t-sm bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_3px,transparent_3px_6px)]' />
						) : (
							<div
								className='flex flex-col-reverse overflow-hidden rounded-t-sm'
								style={{ height: `calc((100% - 1.25rem) * ${Math.min(100, w.accountPct) / 100})` }}
							>
								{w.groups.map(g => (
									<div
										key={g.groupId ?? 'ungrouped'}
										className='not-first:border-b not-first:border-background'
										style={{ backgroundColor: g.color, flexGrow: g.accountPct ?? 0 }}
									/>
								))}
							</div>
						)}
					</div>
					<span className='mt-1.5 truncate text-center text-[11px] text-muted-foreground'>
						{short.format(new Date(w.start))}
					</span>
				</div>
			))}
		</div>
	)
}
