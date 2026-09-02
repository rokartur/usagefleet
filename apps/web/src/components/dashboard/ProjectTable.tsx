import { useEffect, useState } from 'react'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import { type } from 'arktype'
import { useTranslations } from 'use-intl'
import { RelativeTime } from '@/components/RelativeTime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Num, Section } from '@/components/usage-ui'
import type { ProjectUsage } from '@/lib/data'
import { formatTokens, formatUsd } from '@/lib/format'
import { PROJECT_DAYS } from '@/lib/usage'

/** Which projects are hidden and whether names are folded. Per browser, not per
 *  account: it is a way to mute noise in front of you, not a fleet setting. */
const PREFS_KEY = 'usagefleet:projects'
// Straight off a raw storage string: hand-edited or stale prefs read as invalid
// rather than throwing on JSON.parse.
const Prefs = type('string.json.parse').to({ 'hidden?': 'string[]', 'merge?': 'boolean' })

/** Group filter off. A literal because a group could be named "All groups"; it
 *  would collide, and losing that one name is cheaper than a wrapper type.
 *  Stays English in every locale: it is the sentinel value the filter compares
 *  against, not the label the user reads. */
const ALL_GROUPS = 'All groups'

/** How many projects the table lists at once. The rest still count towards the
 *  footer total — a fleet accumulates one-off directories that nobody wants to
 *  scroll, and the filter box is how you reach the ones past the cut. A hard cap
 *  beats virtualising a list that is never meant to be read top to bottom. */
const ROWS = 12

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

/** A table row: one project, or several folded together when merging by name. */
type Row = ProjectUsage & { paths: (string | null)[] }

/** Rows as the table shows them. Merging folds every project whose last folder
 *  name matches, wherever it sits: one checkout cloned to ~/work and ~/Developer
 *  is one project to a human. Display only, the stored rows stay per path, which
 *  is why the merged row keeps them all. */
export function toRows(projects: ProjectUsage[], merge: boolean): Row[] {
	const rows: Row[] = projects.map(p => ({ ...p, groups: [...p.groups], paths: [p.path] }))
	if (!merge) {
		return rows
	}
	const byName = new Map<string, Row>()
	for (const r of rows) {
		const cur = byName.get(splitPath(r.path).name)
		if (!cur) {
			byName.set(splitPath(r.path).name, r)
			continue
		}
		cur.billableTokens += r.billableTokens
		cur.totalTokens += r.totalTokens
		cur.costUsd += r.costUsd
		cur.lastActive = r.lastActive > cur.lastActive ? r.lastActive : cur.lastActive
		cur.paths.push(r.path)
		for (const g of r.groups) {
			if (!cur.groups.some(x => x.name === g.name)) {
				cur.groups.push(g)
			}
		}
	}
	return [...byName.values()].toSorted((a, b) => b.costUsd - a.costUsd)
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
	return `${parent}/${name} ${r.paths.join(' ')} ${r.groups.map(g => g.name).join(' ')}`.toLowerCase()
}

/**
 * Where the tokens went, by working directory — the only project identity the
 * Claude Code logs carry. Costliest first, over a fixed recent window, so this
 * answers "what am I burning the subscription on lately" without a date picker.
 */
export function ProjectTable({ projects }: { projects: ProjectUsage[] }) {
	const t = useTranslations('dash.projects')
	const [query, setQuery] = useState('')
	const [group, setGroup] = useState(ALL_GROUPS)
	const [showHidden, setShowHidden] = useState(false)
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

	const groupOptions = [ALL_GROUPS, ...new Set(projects.flatMap(p => p.groups.map(g => g.name)))].toSorted()
	// Unhiding the last row drops the hidden view with it, so it can never strand
	// you on an empty table.
	const hiddenView = showHidden && hidden.length > 0
	const q = query.trim().toLowerCase()
	const rows = toRows(projects, merge)
		// A merged row only counts as hidden once every path behind it is, so folding
		// two checkouts never makes a visible one disappear.
		.filter(r => keysOf(r).every(k => hidden.includes(k)) === hiddenView)
		.filter(r => group === ALL_GROUPS || r.groups.some(g => g.name === group))
	// Substring, so "~/developer/adescom" narrows to a whole tree and "vapp" to a
	// single checkout.
	const matched = q ? rows.filter(r => searchable(r).includes(q)) : rows
	const shown = matched.slice(0, ROWS)
	// Totals follow the list: hidden projects are muted spend, not counted spend.
	const total = matched.reduce(
		(acc, p) => ({
			billableTokens: acc.billableTokens + p.billableTokens,
			costUsd: acc.costUsd + p.costUsd,
			totalTokens: acc.totalTokens + p.totalTokens,
		}),
		{ billableTokens: 0, costUsd: 0, totalTokens: 0 },
	)

	return (
		<Section
			title={t('title', { days: PROJECT_DAYS })}
			actions={
				<div className='flex flex-wrap items-center gap-2'>
					<Input
						value={query}
						onChange={e => setQuery(e.target.value)}
						placeholder={t('filterPlaceholder')}
						aria-label={t('filterLabel')}
						className='h-8 w-56'
					/>
					<Select
						value={group}
						onValueChange={v => v && setGroup(v)}
						items={groupOptions.map(g => ({ label: g === ALL_GROUPS ? t('allGroups') : g, value: g }))}
					>
						<SelectTrigger size='sm' aria-label={t('group')}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{groupOptions.map(g => (
								<SelectItem key={g} value={g}>
									{g === ALL_GROUPS ? t('allGroups') : g}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						variant={merge ? 'secondary' : 'outline'}
						size='sm'
						aria-pressed={merge}
						onClick={() => persist({ merge: !merge })}
					>
						{t('mergeByName')}
					</Button>
					{hidden.length > 0 && (
						<Button
							variant={hiddenView ? 'secondary' : 'ghost'}
							size='sm'
							aria-pressed={hiddenView}
							onClick={() => setShowHidden(!hiddenView)}
						>
							{t('hidden', { count: hidden.length })}
						</Button>
					)}
				</div>
			}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t('project')}</TableHead>
						<TableHead>{t('group')}</TableHead>
						<TableHead className='text-right'>{t('billable')}</TableHead>
						<TableHead className='text-right'>{t('total')}</TableHead>
						<TableHead className='text-right'>{t('cost')}</TableHead>
						<TableHead className='text-right'>{t('lastUsed')}</TableHead>
						<TableHead>
							<span className='sr-only'>{t('actions')}</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{shown.map(p => {
						const { name, parent } = splitPath(p.path)
						const keys = keysOf(p)
						return (
							<TableRow key={keys.join(' ')} className='group/row'>
								<TableCell className='max-w-96 truncate' title={p.paths.join(', ')}>
									<span className='font-medium'>{p.path ? name : t('noProject')}</span>
									{/* Merged rows span several paths, so the count replaces the parent. */}
									<span className='ml-2 text-muted-foreground'>
										{p.paths.length > 1
											? t('pathCount', { count: p.paths.length })
											: p.path
												? parent
												: t('noProjectHint')}
									</span>
								</TableCell>
								<TableCell className='text-muted-foreground'>
									{/* A path can be checked out on machines in several groups. */}
									{p.groups.map(g => (
										<span
											key={g.name}
											className='mr-2 inline-flex items-center gap-1.5 whitespace-nowrap'
										>
											<span
												className='size-2 shrink-0 rounded-full'
												style={{ backgroundColor: g.color }}
												aria-hidden
											/>
											{g.name}
										</span>
									))}
								</TableCell>
								<TableCell className='text-right'>
									<Num value={p.billableTokens} format={formatTokens} />
								</TableCell>
								<TableCell className='text-right text-muted-foreground'>
									<Num value={p.totalTokens} format={formatTokens} />
								</TableCell>
								<TableCell className='text-right'>
									<Num value={p.costUsd} format={formatUsd} />
								</TableCell>
								<TableCell className='text-right whitespace-nowrap text-muted-foreground'>
									<RelativeTime date={p.lastActive} />
								</TableCell>
								<TableCell className='py-0 text-right'>
									<Button
										variant='ghost'
										size='icon-sm'
										// Keyboard users get it on focus; a mouse only needs it on the row it is over.
										className='text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100'
										aria-label={t(hiddenView ? 'unhide' : 'hide', { name })}
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
							<TableCell colSpan={7} className='text-muted-foreground'>
								{q ? t('noMatchQuery', { query: query.trim() }) : t('noMatch')}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
				<TableFooter>
					<TableRow>
						<TableCell>
							{t(hiddenView ? 'hiddenTotal' : 'total')}
							<span className='ml-2 font-normal text-muted-foreground'>
								{[
									matched.length > shown.length && t('scope', { count: matched.length }),
									!hiddenView && hidden.length > 0 && t('hiddenExcluded', { count: hidden.length }),
								]
									.filter(Boolean)
									.join(', ')}
							</span>
						</TableCell>
						<TableCell />
						<TableCell className='text-right'>
							<Num value={total.billableTokens} format={formatTokens} />
						</TableCell>
						<TableCell className='text-right'>
							<Num value={total.totalTokens} format={formatTokens} />
						</TableCell>
						<TableCell className='text-right'>
							<Num value={total.costUsd} format={formatUsd} />
						</TableCell>
						<TableCell />
						<TableCell />
					</TableRow>
				</TableFooter>
			</Table>
		</Section>
	)
}
