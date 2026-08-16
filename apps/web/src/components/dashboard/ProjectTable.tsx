import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Num, Section } from '@/components/usage-ui'
import type { ProjectUsage } from '@/lib/data'
import { formatRelative, formatTokens, formatUsd } from '@/lib/format'
import { PROJECT_DAYS } from '@/lib/usage'

/** How many projects the table lists at once. The rest still count towards the
 *  footer total — a fleet accumulates one-off directories that nobody wants to
 *  scroll, and the filter box is how you reach the ones past the cut. A hard cap
 *  beats virtualising a list that is never meant to be read top to bottom. */
const ROWS = 12

/** Split an absolute cwd into the directory name and the path leading to it,
 *  with the home directory folded to "~". Two checkouts can share a basename,
 *  so the parent is what tells them apart. */
function splitPath(path: string | null): { name: string; parent: string } {
	if (!path) {
		// Not a project: Claude Desktop and pi log no working directory, so their
		// whole usage lands in this one bucket.
		return { name: 'No project', parent: 'logged without a working directory' }
	}
	const parts = path.split('/').filter(Boolean)
	const name = parts.at(-1) ?? path
	const parent = parts.slice(0, -1)
	// /Users/artur/Developer and /home/artur/Developer both read as ~/Developer.
	const home = parent[0] === 'Users' || parent[0] === 'home'
	return { name, parent: home ? ['~', ...parent.slice(2)].join('/') : `/${parent.join('/')}` }
}

/** What the filter box searches: the path as displayed *and* as stored, so both
 *  "~/developer/adescom" and "/Users/artur/Developer" find the same rows. */
function searchable(p: ProjectUsage): string {
	const { name, parent } = splitPath(p.path)
	return `${parent}/${name} ${p.path ?? ''}`.toLowerCase()
}

/**
 * Where the tokens went, by working directory — the only project identity the
 * Claude Code logs carry. Costliest first, over a fixed recent window, so this
 * answers "what am I burning the subscription on lately" without a date picker.
 */
export function ProjectTable({ projects }: { projects: ProjectUsage[] }) {
	const [query, setQuery] = useState('')
	const q = query.trim().toLowerCase()
	// Substring, so "~/developer/adescom" narrows to a whole tree and "vapp" to a
	// single checkout.
	const matched = q ? projects.filter(p => searchable(p).includes(q)) : projects
	const shown = matched.slice(0, ROWS)
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
			title={`Projects · last ${PROJECT_DAYS} days`}
			actions={
				<Input
					value={query}
					onChange={e => setQuery(e.target.value)}
					placeholder='Filter by path'
					aria-label='Filter projects by path'
					className='h-8 w-56'
				/>
			}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Project</TableHead>
						<TableHead className='text-right'>Billable</TableHead>
						<TableHead className='text-right'>Total</TableHead>
						<TableHead className='text-right'>Cost</TableHead>
						<TableHead className='text-right'>Last used</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{shown.map(p => {
						const { name, parent } = splitPath(p.path)
						return (
							<TableRow key={p.path ?? 'unknown'}>
								<TableCell className='max-w-96 truncate' title={p.path ?? undefined}>
									<span className='font-medium'>{name}</span>
									{parent && <span className='ml-2 text-muted-foreground'>{parent}</span>}
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
									{formatRelative(p.lastActive)}
								</TableCell>
							</TableRow>
						)
					})}
					{shown.length === 0 && (
						<TableRow>
							<TableCell colSpan={5} className='text-muted-foreground'>
								No project matches “{query.trim()}”.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
				<TableFooter>
					<TableRow>
						<TableCell>
							Total
							{matched.length > shown.length && (
								<span className='ml-2 font-normal text-muted-foreground'>
									across {matched.length} projects
								</span>
							)}
						</TableCell>
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
					</TableRow>
				</TableFooter>
			</Table>
		</Section>
	)
}
