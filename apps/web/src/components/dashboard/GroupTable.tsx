import { Fragment } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Num, overrun, UsageBar } from '@/components/usage-ui'
import type { LiveGroupUsage } from '@/lib/data'
import { formatTokens } from '@/lib/format'
import type { ModelUsage } from '@/lib/usage'
import { cn } from '@/lib/utils'

/** One group's per-model tokens, session (5h) and weekly side by side. Models
 *  active in either window appear; a window with no activity reads "—". */
function ModelCompare({ session, weekly }: { session: ModelUsage[]; weekly: ModelUsage[] }) {
	const byKey = new Map<string, { model: string; label: string; session?: ModelUsage; weekly?: ModelUsage }>()
	for (const m of weekly) {
		byKey.set(m.model, { label: m.label, model: m.model, weekly: m })
	}
	for (const m of session) {
		const cur = byKey.get(m.model)
		if (cur) {
			cur.session = m
		} else {
			byKey.set(m.model, { label: m.label, model: m.model, session: m })
		}
	}
	const rows = [...byKey.values()].toSorted(
		(a, b) =>
			(b.weekly?.billableTokens ?? 0) - (a.weekly?.billableTokens ?? 0) ||
			(b.session?.billableTokens ?? 0) - (a.session?.billableTokens ?? 0),
	)
	if (rows.length === 0) {
		return <p className='text-xs text-muted-foreground'>No model activity in the current windows yet.</p>
	}
	const cell = (u: ModelUsage | undefined) =>
		u ? (
			<>
				<span className='text-foreground'>{formatTokens(u.billableTokens)}</span>
				{' / '}
				{formatTokens(u.totals.totalTokens)}
			</>
		) : (
			'—'
		)
	return (
		<div className='flex flex-col gap-1.5'>
			<p className='text-[11px] text-muted-foreground'>Per model — billable / total tokens</p>
			<dl className='grid gap-x-8 text-xs sm:grid-cols-2'>
				{rows.map(r => (
					<div
						key={r.model}
						className='flex items-baseline justify-between gap-3 border-b border-dashed py-1 last:border-0'
					>
						<dt className='truncate font-medium'>{r.label}</dt>
						<dd className='shrink-0 text-muted-foreground tabular-nums'>
							5h {cell(r.session)} · 7d {cell(r.weekly)}
						</dd>
					</div>
				))}
			</dl>
		</div>
	)
}

const approxPct = (n: number) => `~${Math.round(n)}%`

/** "~42% · ~38% by cost · 1.2M (3.4M total)" — a group's usage in one window.
 *  The cost figure appears only when it disagrees with the attributed one
 *  (both arrive rounded); equal values would just repeat the number. */
function WindowCell({
	pct,
	costPct,
	tokens,
	totalTokens,
}: {
	pct: number
	costPct: number
	tokens: number
	totalTokens: number
}) {
	return (
		<div className='flex min-w-48 items-center gap-3'>
			<UsageBar pct={pct} className='w-20 shrink-0' />
			<span className='tabular-nums'>
				<Num value={pct} format={approxPct} className={cn('font-medium', overrun(pct))} />
				<span className='text-muted-foreground'>
					{costPct !== pct && (
						<>
							{' '}
							· <Num value={costPct} format={approxPct} /> by cost
						</>
					)}{' '}
					· <Num value={tokens} format={formatTokens} /> (<Num value={totalTokens} format={formatTokens} />{' '}
					total)
				</span>
			</span>
		</div>
	)
}

/** Column header with a tooltip explaining what the percentage measures. */
function WindowHead({ label }: { label: string }) {
	return (
		<TableHead>
			<Tooltip>
				<TooltipTrigger render={<span className='underline decoration-dotted underline-offset-4' />}>
					{label}
				</TooltipTrigger>
				<TooltipContent>
					Percentage of this group&apos;s own slice of the account limit, attributed by when the official
					meter rose; &quot;by cost&quot; is the same slice split by cost share alone, shown when the two
					disagree. Tokens are billable, with the cache-read-inclusive total in brackets.
				</TooltipContent>
			</Tooltip>
		</TableHead>
	)
}

/** A group as the table renders it. `account` is set only when several
 *  Anthropic accounts are merged into one table: the same group can hold
 *  devices on two subscriptions and then appears once per account. */
export type GroupRow = LiveGroupUsage & { account?: string }

/** Expand key: unique per row, so a group split across accounts toggles
 *  independently. */
const groupRowKey = (g: GroupRow) => `${g.account ?? ''}:${g.groupId ?? 'ungrouped'}`

/** Group-vs-group comparison over both windows. Rows expand to reveal each
 *  group's per-model session/weekly breakdown. */
export function GroupTable({
	groups,
	expanded,
	onToggle,
}: {
	groups: GroupRow[]
	expanded: Set<string>
	onToggle: (key: string) => void
}) {
	const showAccount = groups.some(g => g.account)
	if (groups.length === 0) {
		return (
			<Empty className='border'>
				<EmptyHeader>
					<EmptyTitle>No activity yet</EmptyTitle>
					<EmptyDescription>No device has reported usage in the current windows.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Group</TableHead>
					{showAccount && <TableHead>Account</TableHead>}
					<WindowHead label='Session (5h)' />
					<WindowHead label='Weekly' />
				</TableRow>
			</TableHeader>
			<TableBody>
				{groups.map(g => {
					const key = groupRowKey(g)
					const isOpen = expanded.has(key)
					const modelCount = new Set([...g.models, ...g.sessionModels].map(m => m.model)).size
					return (
						<Fragment key={key}>
							<TableRow>
								<TableCell>
									<button
										type='button'
										onClick={() => onToggle(key)}
										aria-expanded={isOpen}
										className='inline-flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
									>
										<ChevronRightIcon
											className={`size-3.5 text-muted-foreground transition-transform ${
												isOpen ? 'rotate-90' : ''
											}`}
											aria-hidden
										/>
										<span
											className='size-2.5 shrink-0 rounded-full'
											style={{ backgroundColor: g.color }}
											aria-hidden
										/>
										<span className='font-medium'>{g.name}</span>
										<Badge variant='secondary' className='font-normal'>
											{modelCount} model{modelCount === 1 ? '' : 's'}
										</Badge>
									</button>
								</TableCell>
								{showAccount && (
									<TableCell className='max-w-48 truncate text-muted-foreground'>
										{g.account}
									</TableCell>
								)}
								<TableCell>
									<WindowCell
										pct={g.sessionBudgetPct}
										costPct={g.sessionCostPct}
										tokens={g.sessionTokens}
										totalTokens={g.sessionTotalTokens}
									/>
								</TableCell>
								<TableCell>
									<WindowCell
										pct={g.weeklyBudgetPct}
										costPct={g.weeklyCostPct}
										tokens={g.weeklyTokens}
										totalTokens={g.weeklyTotalTokens}
									/>
								</TableCell>
							</TableRow>
							{isOpen && (
								<TableRow className='bg-muted/40 hover:bg-muted/40'>
									<TableCell colSpan={showAccount ? 4 : 3} className='py-3 whitespace-normal'>
										<ModelCompare session={g.sessionModels} weekly={g.models} />
									</TableCell>
								</TableRow>
							)}
						</Fragment>
					)
				})}
			</TableBody>
		</Table>
	)
}
