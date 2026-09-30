import { useEffect, useState } from 'react'
import { IconArrowsSplit2, IconDots, IconEye, IconEyeOff } from '@tabler/icons-react'
import { type } from 'arktype'
import { useTranslations } from 'use-intl'
import { ActionForm } from '@/components/ActionForm'
import { RelativeTime } from '@/components/RelativeTime'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Num, Section } from '@/components/usage-ui'
import { mergeProjects, unmergeProject } from '@/lib/actions'
import type { ProjectUsage } from '@/lib/data'
import { formatTokens, formatUsd } from '@/lib/format'
import { PROJECT_DAYS } from '@/lib/usage'
import { cn } from '@/lib/utils'

/** Which projects are hidden and whether names are folded. Per browser, not per
 *  account: it is a way to mute noise in front of you, not a fleet setting. */
const PREFS_KEY = 'usagefleet:projects'
// Straight off a raw storage string: hand-edited or stale prefs read as invalid
// rather than throwing on JSON.parse.
const Prefs = type('string.json.parse').to({ 'hidden?': 'string[]', 'merge?': 'boolean' })

/** How many projects the table lists at once. The rest still count towards the
 *  headline total — a fleet accumulates one-off directories that nobody wants to
 *  scroll, and the filter box is how you reach the ones past the cut. A hard cap
 *  beats virtualising a list that is never meant to be read top to bottom. */
const ROWS = 12

/** Projects that get their own segment on the share strip; the rest share one. */
const STRIP = 5

// Keyboard users get row buttons on focus; a mouse only needs them on the row it is over.
const REVEAL = 'text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100'

const SORTS = {
	cost: (a: Row, b: Row) => b.costUsd - a.costUsd,
	// Dollars, not percent: a $0.10 project tripling should not outrank a $40 one growing by half.
	change: (a: Row, b: Row) => b.costUsd - b.prevCostUsd - (a.costUsd - a.prevCostUsd),
	recent: (a: Row, b: Row) => b.lastActive.localeCompare(a.lastActive),
}
type Sort = keyof typeof SORTS

/** Split an absolute cwd into the directory name and the path leading to it,
 *  with the home directory folded to "~". Two checkouts can share a basename,
 *  so the parent is what tells them apart. Windows cwds arrive verbatim from the
 *  logs ("C:\\Users\\me\\src"), so both separators split and the display keeps
 *  the one the machine used. */
export function splitPath(path: string | null): { name: string; parent: string } {
	if (!path) {
		// Not a project: Claude Desktop and pi log no working directory, so their
		// whole usage lands in this one bucket. Left in English because the name
		// doubles as the merge key; the table translates it when it renders.
		return { name: 'No project', parent: 'logged without a working directory' }
	}
	const sep = path.includes('\\') ? '\\' : '/'
	const parts = path.split(/[/\\]/).filter(Boolean)
	const name = parts.at(-1) ?? path
	// A leading "C:" is a drive, not a directory — peeling it off leaves a path
	// shaped like the posix ones, so one home check covers every OS.
	const drive = /^[a-z]:$/i.test(parts[0] ?? '') ? parts[0] : null
	const parent = parts.slice(drive ? 1 : 0, -1)
	// /Users/artur/Developer, /home/artur/Developer and C:\Users\artur\Developer
	// all read as ~/Developer.
	if (parent[0] === 'Users' || parent[0] === 'home') {
		return { name, parent: ['~', ...parent.slice(2)].join(sep) }
	}
	return { name, parent: drive ? [drive, ...parent].join(sep) : `/${parent.join('/')}` }
}

/** A table row: one project, or several folded together. */
type Row = ProjectUsage & { paths: (string | null)[] }

/** Rows as the table shows them, costliest first. Display only, the stored rows
 *  stay per path, which is why a folded row keeps them all. */
export function toRows(projects: ProjectUsage[], mergeByName: boolean): Row[] {
	const byKey = new Map<string, Row>()
	for (const p of projects) {
		const key = foldKey(p, mergeByName)
		const cur = byKey.get(key)
		if (!cur) {
			byKey.set(key, { ...p, daily: [...p.daily], groups: p.groups.map(g => ({ ...g })), paths: [p.path] })
			continue
		}
		cur.billableTokens += p.billableTokens
		cur.totalTokens += p.totalTokens
		cur.costUsd += p.costUsd
		cur.prevCostUsd += p.prevCostUsd
		cur.lastActive = p.lastActive > cur.lastActive ? p.lastActive : cur.lastActive
		cur.paths.push(p.path)
		for (const [i, cost] of p.daily.entries()) {
			cur.daily[i] += cost
		}
		for (const g of p.groups) {
			const same = cur.groups.find(x => x.name === g.name)
			if (same) {
				same.costUsd += g.costUsd
			} else {
				cur.groups.push({ ...g })
			}
		}
		cur.groups.sort((a, b) => b.costUsd - a.costUsd)
	}
	return [...byKey.values()].toSorted(SORTS.cost)
}

/** A hand merge always wins. Otherwise merging by name folds every project whose
 *  last folder name matches, wherever it sits: one checkout cloned to ~/work and
 *  ~/Developer is one project to a human. */
function foldKey(p: ProjectUsage, mergeByName: boolean): string {
	if (p.mergedAs !== null) {
		return `merged:${p.mergedAs}`
	}
	if (mergeByName) {
		return `name:${splitPath(p.path).name}`
	}
	return `path:${p.path ?? ''}`
}

/** Hiding is remembered by path, so a merged row hides every path behind it. */
function keysOf(r: Row): string[] {
	return r.paths.map(p => p ?? '')
}

/** What the filter box searches: the path as displayed *and* as stored, so both
 *  "~/developer/adescom" and "/Users/artur/Developer" find the same rows, plus
 *  the group names so "laptops" narrows to one part of the fleet. */
function searchable(r: Row): string {
	const { name, parent } = splitPath(r.path)
	return `${r.mergedAs ?? ''} ${parent}/${name} ${r.paths.join(' ')} ${r.groups.map(g => g.name).join(' ')}`.toLowerCase()
}

/**
 * Where the tokens went, by working directory — the only project identity the
 * Claude Code logs carry. A share strip on top answers "what am I burning the
 * subscription on", the rows below answer "and is it growing". `readOnly` drops
 * the merge controls: on the admin view they would act on the admin's own
 * account, not the one on screen.
 */
export function ProjectTable({ projects, readOnly = false }: { projects: ProjectUsage[]; readOnly?: boolean }) {
	const t = useTranslations('dash.projects')
	const [query, setQuery] = useState('')
	// null is every group.
	const [group, setGroup] = useState<string | null>(null)
	const [sort, setSort] = useState<Sort>('cost')
	const [showHidden, setShowHidden] = useState(false)
	// Row under the pointer, so its strip segment can stand out.
	const [hovered, setHovered] = useState<string | null>(null)
	// Selected paths, not rows, so a selection survives filtering: narrow, tick, narrow again.
	const [selected, setSelected] = useState<string[]>([])
	// Merging by hand is a mode: the checkboxes only show while it is on.
	const [picking, setPicking] = useState(false)
	const [{ hidden, merge }, setPrefs] = useState({ hidden: [] as string[], merge: false })
	// The server has no idea what this browser muted, so the first paint is the
	// unfiltered table and the stored prefs land right after mount.
	useEffect(() => {
		const saved = Prefs(localStorage.getItem(PREFS_KEY) ?? '{}')
		if (saved instanceof type.errors) {
			return
		}
		// oxlint-disable-next-line react/react-compiler -- storage is only readable after mount
		setPrefs({ hidden: saved.hidden ?? [], merge: saved.merge ?? false })
	}, [])
	const persist = (next: { hidden?: string[]; merge?: boolean }) => {
		const prefs = { hidden, merge, ...next }
		setPrefs(prefs)
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
	}

	const groupColors = new Map(projects.flatMap(p => p.groups.map(g => [g.name, g.color] as const)))
	const groupOptions = [...groupColors.keys()].toSorted()
	// Unhiding the last row drops the hidden view with it, so it can never strand
	// you on an empty table.
	const hiddenView = showHidden && hidden.length > 0
	const q = query.trim().toLowerCase()
	const allRows = toRows(projects, merge)
	const isSelected = (r: Row) => keysOf(r).every(k => selected.includes(k))
	const selectedRows = allRows.filter(isSelected)
	const rows = allRows
		// A merged row only counts as hidden once every path behind it is, so folding
		// two checkouts never makes a visible one disappear.
		.filter(r => keysOf(r).every(k => hidden.includes(k)) === hiddenView)
		.filter(r => group === null || r.groups.some(g => g.name === group))
	// Substring, so "~/developer/adescom" narrows to a whole tree and "vapp" to a
	// single checkout. Still costliest first here, which is what the strip wants.
	const matched = q ? rows.filter(r => searchable(r).includes(q)) : rows
	const shown = matched.toSorted(SORTS[sort]).slice(0, ROWS)
	// Totals follow the list: hidden projects are muted spend, not counted spend.
	let costUsd = 0
	let billable = 0
	for (const r of matched) {
		costUsd += r.costUsd
		billable += r.billableTokens
	}
	const striped = matched.slice(0, STRIP)
	const restCost = matched.slice(STRIP).reduce((sum, r) => sum + r.costUsd, 0)
	const rowKey = (r: Row) => keysOf(r).join(' ')
	const hoveredRest = hovered !== null && !striped.some(r => rowKey(r) === hovered)
	const share = (n: number) => `${Math.round(costUsd > 0 ? (n / costUsd) * 100 : 0)}%`

	return (
		<Section
			title={t('title', { days: PROJECT_DAYS })}
			actions={
				<div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
					<Input
						value={query}
						onChange={e => setQuery(e.target.value)}
						placeholder={t('filterPlaceholder')}
						aria-label={t('filterLabel')}
						className='h-8 w-56'
					/>
					<fieldset aria-label={t('sortLabel')} className='flex items-center gap-3'>
						{(['cost', 'change', 'recent'] as const).map(s => (
							<TextToggle key={s} pressed={sort === s} onClick={() => setSort(s)}>
								{t(`sortBy.${s}`)}
							</TextToggle>
						))}
					</fieldset>
					{/* Rarely touched, so they sit behind one button instead of three. */}
					<DropdownMenu>
						<DropdownMenuTrigger
							render={<Button variant='ghost' size='icon-sm' aria-label={t('options')} />}
						>
							<IconDots />
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end' className='w-52'>
							<DropdownMenuCheckboxItem
								checked={merge}
								onCheckedChange={() => persist({ merge: !merge })}
							>
								{t('mergeByName')}
							</DropdownMenuCheckboxItem>
							{!readOnly && (
								<DropdownMenuCheckboxItem
									checked={picking}
									onCheckedChange={() => {
										setPicking(!picking)
										setSelected([])
									}}
								>
									{t('mergeByHand')}
								</DropdownMenuCheckboxItem>
							)}
							{hidden.length > 0 && (
								<DropdownMenuCheckboxItem
									checked={hiddenView}
									onCheckedChange={() => setShowHidden(!hiddenView)}
								>
									{t('hidden', { count: hidden.length })}
								</DropdownMenuCheckboxItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			}
		>
			<div className='flex flex-wrap items-baseline gap-x-3'>
				<Num value={costUsd} format={formatUsd} className='text-2xl font-medium tracking-tight' />
				<span className='text-sm text-muted-foreground'>
					{[
						hiddenView && t('hiddenTotal'),
						t('summary', { count: matched.length, tokens: formatTokens(billable) }),
						!hiddenView && hidden.length > 0 && t('hiddenExcluded', { count: hidden.length }),
					]
						.filter(Boolean)
						.join(', ')}
				</span>
			</div>
			{costUsd > 0 && (
				<>
					<div aria-hidden className='mt-3 flex h-3 gap-0.5'>
						{striped.map((r, i) => (
							<span
								key={rowKey(r)}
								className='rounded-xs bg-foreground transition-opacity duration-150'
								style={{
									flexGrow: r.costUsd,
									opacity: hovered === null || hovered === rowKey(r) ? stripShade(i) : 0.12,
								}}
							/>
						))}
						{restCost > 0 && (
							<span
								className='rounded-xs bg-foreground transition-opacity duration-150'
								style={{
									flexGrow: restCost,
									opacity: hovered === null || hoveredRest ? stripShade(STRIP) : 0.06,
								}}
							/>
						)}
					</div>
					<ul className='mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs'>
						{striped.map((r, i) => (
							<li key={rowKey(r)} className='flex items-center gap-1.5'>
								<span
									aria-hidden
									className='size-2 rounded-xs bg-foreground'
									style={{ opacity: stripShade(i) }}
								/>
								{r.mergedAs ?? (r.path ? splitPath(r.path).name : t('noProject'))}
								<span className='text-muted-foreground'>{share(r.costUsd)}</span>
							</li>
						))}
						{restCost > 0 && (
							<li className='flex items-center gap-1.5 text-muted-foreground'>
								<span
									aria-hidden
									className='size-2 rounded-xs bg-foreground'
									style={{ opacity: stripShade(STRIP) }}
								/>
								{t('more', { count: matched.length - striped.length })} {share(restCost)}
							</li>
						)}
					</ul>
				</>
			)}
			{/* Doubles as the legend for the split bars, which carry no names. */}
			{groupOptions.length > 1 && (
				<fieldset aria-label={t('group')} className='mt-4 flex flex-wrap items-center gap-x-3 gap-y-1'>
					<TextToggle pressed={group === null} onClick={() => setGroup(null)}>
						{t('allGroups')}
					</TextToggle>
					{groupOptions.map(name => (
						<TextToggle key={name} pressed={group === name} onClick={() => setGroup(name)}>
							<span
								aria-hidden
								className='mr-1.5 inline-block size-2 rounded-full'
								style={{ backgroundColor: groupColors.get(name) }}
							/>
							{name}
						</TextToggle>
					))}
				</fieldset>
			)}
			{!readOnly && selectedRows.length > 0 && (
				<ActionForm
					action={mergeProjects}
					loadingMessage={t('merging')}
					successMessage={t('merged')}
					onSuccess={() => setSelected([])}
					className='mt-3 flex flex-wrap items-center gap-2'
				>
					<span className='text-sm text-muted-foreground'>
						{t('selected', { count: selectedRows.length })}
					</span>
					{selectedRows.flatMap(keysOf).map(k => (
						<input key={k} type='hidden' name='path' value={k} />
					))}
					<Input
						name='name'
						required
						maxLength={64}
						placeholder={t('mergeName')}
						aria-label={t('mergeName')}
						className='h-8 w-56'
					/>
					<Button type='submit' size='sm' disabled={selectedRows.length < 2}>
						{t('merge')}
					</Button>
					<Button type='button' variant='ghost' size='sm' onClick={() => setSelected([])}>
						{t('clearSelection')}
					</Button>
				</ActionForm>
			)}
			<Table className='mt-3'>
				<TableHeader>
					<TableRow>
						{picking && (
							<TableHead className='w-8'>
								<span className='sr-only'>{t('merge')}</span>
							</TableHead>
						)}
						<TableHead>{t('project')}</TableHead>
						<TableHead>{t('daily')}</TableHead>
						<TableHead>{t('group')}</TableHead>
						<TableHead className='text-right'>{t('cost')}</TableHead>
						<TableHead className='text-right' title={t('changeHint', { days: PROJECT_DAYS })}>
							{t('change')}
						</TableHead>
						<TableHead className='text-right'>{t('lastUsed')}</TableHead>
						<TableHead>
							<span className='sr-only'>{t('actions')}</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{shown.map(p => {
						const { name, parent } = splitPath(p.path)
						const label = p.mergedAs ?? (p.path ? name : t('noProject'))
						const keys = keysOf(p)
						return (
							<TableRow
								key={rowKey(p)}
								className='group/row'
								onPointerEnter={() => setHovered(rowKey(p))}
								onPointerLeave={() => setHovered(null)}
							>
								{picking && (
									<TableCell>
										<Checkbox
											checked={isSelected(p)}
											onCheckedChange={checked =>
												setSelected(
													checked
														? [...selected, ...keys]
														: selected.filter(k => !keys.includes(k)),
												)
											}
											aria-label={t('select', { name: label })}
										/>
									</TableCell>
								)}
								<TableCell className='max-w-80 truncate' title={p.paths.join(', ')}>
									<span className='font-medium'>{label}</span>
									{/* Merged rows span several paths, so the count replaces the parent. */}
									<span className='ml-2 text-muted-foreground'>
										{p.paths.length > 1
											? t('pathCount', { count: p.paths.length })
											: p.path
												? parent
												: t('noProjectHint')}
									</span>
								</TableCell>
								<TableCell>
									<Sparkline daily={p.daily} />
								</TableCell>
								<TableCell>
									<GroupSplit groups={p.groups} />
								</TableCell>
								<TableCell
									className='text-right'
									title={t('tokens', {
										billable: formatTokens(p.billableTokens),
										total: formatTokens(p.totalTokens),
									})}
								>
									<Num value={p.costUsd} format={formatUsd} />
								</TableCell>
								<TableCell className='text-right'>
									<Change now={p.costUsd} prev={p.prevCostUsd} />
								</TableCell>
								<TableCell className='text-right whitespace-nowrap text-muted-foreground'>
									<RelativeTime date={p.lastActive} />
								</TableCell>
								<TableCell className='py-0 text-right whitespace-nowrap'>
									{!readOnly && p.mergedAs !== null && (
										<ActionForm
											action={unmergeProject}
											loadingMessage={t('unmerging')}
											successMessage={t('unmerged')}
											className='inline-flex'
										>
											<input type='hidden' name='name' value={p.mergedAs} />
											<Button
												type='submit'
												variant='ghost'
												size='icon-sm'
												className={REVEAL}
												aria-label={t('unmerge', { name: label })}
											>
												<IconArrowsSplit2 />
											</Button>
										</ActionForm>
									)}
									<Button
										variant='ghost'
										size='icon-sm'
										className={REVEAL}
										aria-label={t(hiddenView ? 'unhide' : 'hide', { name: label })}
										onClick={() =>
											persist({
												hidden: hiddenView
													? hidden.filter(k => !keys.includes(k))
													: [...hidden, ...keys],
											})
										}
									>
										{hiddenView ? <IconEye /> : <IconEyeOff />}
									</Button>
								</TableCell>
							</TableRow>
						)
					})}
					{shown.length === 0 && (
						<TableRow>
							<TableCell colSpan={picking ? 8 : 7} className='text-muted-foreground'>
								{q ? t('noMatchQuery', { query: query.trim() }) : t('noMatch')}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</Section>
	)
}

/** Strip segments step down in brightness by rank, so neighbours stay apart
 *  without spending colours that already mean groups. */
function stripShade(rank: number): number {
	return [0.9, 0.68, 0.5, 0.36, 0.26][rank] ?? 0.14
}

function TextToggle({
	pressed,
	onClick,
	children,
}: {
	pressed: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type='button'
			aria-pressed={pressed}
			onClick={onClick}
			className={cn(
				'inline-flex items-center rounded-sm text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
				pressed
					? 'text-foreground underline underline-offset-4'
					: 'text-muted-foreground hover:text-foreground',
			)}
		>
			{children}
		</button>
	)
}

/** Daily cost as bars, scaled to the row's own peak: the shape is the point,
 *  the size is in the cost column. */
function Sparkline({ daily }: { daily: number[] }) {
	const peak = Math.max(...daily)
	let d = ''
	for (const [i, cost] of daily.entries()) {
		if (cost > 0) {
			d += `M${i * 3} 16v${-Math.max(1, (cost / peak) * 16)}h2V16z`
		}
	}
	return (
		<svg aria-hidden viewBox={`0 0 ${daily.length * 3} 16`} className='h-4 w-[90px] fill-foreground/55'>
			<path d={d} />
		</svg>
	)
}

function GroupSplit({ groups }: { groups: ProjectUsage['groups'] }) {
	const sum = groups.reduce((acc, g) => acc + g.costUsd, 0)
	const label = groups.map(g => `${g.name} ${Math.round(sum > 0 ? (g.costUsd / sum) * 100 : 0)}%`).join(', ')
	return (
		<div title={label} className='flex h-1.5 w-20 gap-px overflow-hidden rounded-xs'>
			<span className='sr-only'>{label}</span>
			{groups.map(g => (
				<span key={g.name} style={{ backgroundColor: g.color, flexGrow: g.costUsd }} />
			))}
		</div>
	)
}

function Change({ now, prev }: { now: number; prev: number }) {
	const t = useTranslations('dash.projects')
	if (prev === 0) {
		return <span>{t('new')}</span>
	}
	const pct = Math.round(((now - prev) / prev) * 100)
	return (
		<span className={cn('tabular-nums', pct < 0 && 'text-muted-foreground')}>
			{pct > 0 ? '+' : ''}
			{pct}%
		</span>
	)
}
