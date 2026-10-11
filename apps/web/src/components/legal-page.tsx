import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/** Shell for the two legal pages: same header and footer as the landing page,
 *  one measure-capped column, no motion. Prose, not product. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
	return (
		<div className='flex-1 bg-background text-foreground'>
			<SiteHeader />

			<div className='mx-auto w-full max-w-7xl px-6'>
				<article className='max-w-[74ch] py-16'>
					<h1 className='text-4xl font-semibold tracking-[-0.04em]'>{title}</h1>
					<p className='mt-3 text-sm text-muted-foreground'>Last updated {updated}</p>
					<div className='mt-12 flex flex-col gap-9'>{children}</div>
				</article>
				<SiteFooter />
			</div>
		</div>
	)
}

/** One numbered-feeling section of a policy: heading plus body paragraphs. */
export function Clause({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section>
			<h2 className='text-lg font-medium tracking-tight'>{title}</h2>
			<div className='mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground'>{children}</div>
		</section>
	)
}

/** List inside a clause, as hairline-separated numbered rows: countable enough
 *  to cite one line of a policy without quoting the whole clause. */
export function Bullets({ items }: { items: ReactNode[] }) {
	return (
		<ul className='my-1 divide-y divide-border border-y border-border'>
			{items.map((item, i) => (
				// Static copy: the list never reorders, so the index is a stable key.
				<li key={i} className='grid grid-cols-[2rem_1fr] py-2.5'>
					<span className='text-muted-foreground tabular-nums'>{i + 1}</span>
					<span>{item}</span>
				</li>
			))}
		</ul>
	)
}
