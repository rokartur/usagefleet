import { useEffect } from 'react'
import { createRouter, Link, useRouterState } from '@tanstack/react-router'
import { TriangleAlertIcon } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { routeTree } from './routeTree.gen'

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		// Dashboard data is live usage; refetch on every navigation rather than
		// serving a stale loader result.
		defaultPreload: 'intent',
		defaultStaleTime: 0,
		defaultErrorComponent: RouteError,
		defaultPendingComponent: RoutePending,
		defaultNotFoundComponent: RouteNotFound,
	})
}

/** One boundary for the whole app: the root shell always renders, so a failed
 *  loader or render lands here instead of on an unstyled error screen. */
function RouteError({ error, reset }: { error: Error; reset: () => void }) {
	useEffect(() => {
		console.error(error)
	}, [error])

	return (
		<Card className='py-8'>
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant='icon'>
						<TriangleAlertIcon />
					</EmptyMedia>
					<EmptyTitle>Something went wrong</EmptyTitle>
					<EmptyDescription>We couldn&apos;t load this page. This is usually temporary.</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button onClick={reset}>Try again</Button>
				</EmptyContent>
			</Empty>
		</Card>
	)
}

/** Unknown URL, or a route that threw notFound(). Public-page frame, and the
 *  failure itself reported the way the collector would report it. */
function RouteNotFound() {
	const pathname = useRouterState({ select: s => s.location.pathname })

	return (
		<div className='flex flex-1 flex-col bg-background text-foreground'>
			<SiteHeader />
			<div className='mx-auto flex w-full max-w-7xl flex-1 flex-col px-6'>
				<main className='flex flex-1 items-center justify-center py-20'>
					<div className='w-full max-w-xl'>
						<div className='overflow-hidden rounded-lg border border-border font-mono text-xs'>
							<div className='flex items-center justify-between border-b border-border px-3.5 py-2 text-[11px] tracking-[0.06em] text-muted-foreground/70'>
								<span>USAGEFLEET</span>
								<span>404</span>
							</div>
							<div className='px-3.5 py-3.5 leading-relaxed'>
								<p className='break-all'>
									<span className='text-muted-foreground/60'>$</span> usagefleet open {pathname}
								</p>
								<dl className='mt-2 grid grid-cols-[8rem_1fr] text-muted-foreground'>
									<dt>resolving route</dt>
									<dd className='text-destructive'>not found</dd>
									<dt>status</dt>
									<dd className='text-destructive'>404</dd>
									<dt>devices</dt>
									<dd>reporting, unaffected</dd>
									<dt>usage</dt>
									<dd>nothing lost</dd>
								</dl>
							</div>
						</div>
						<h1 className='mt-7 text-2xl font-semibold tracking-[-0.035em]'>No route by that name.</h1>
						<p className='mt-2.5 text-sm leading-relaxed text-muted-foreground'>
							The link is dead or the page moved. Your collectors kept running the whole time.
						</p>
						<div className='mt-6 flex flex-wrap gap-3'>
							<Link to='/dashboard' className={buttonVariants()}>
								Go to dashboard
							</Link>
							<Link to='/' className={buttonVariants({ variant: 'ghost' })}>
								Home
							</Link>
						</div>
					</div>
				</main>
				<SiteFooter />
			</div>
		</div>
	)
}

/** Shown once a loader outruns defaultPendingMs. Mirrors the dashboard shape
 *  (status line → KPI pair → table card) so the swap doesn't jump. */
function RoutePending() {
	return (
		<div className='flex flex-1 flex-col gap-6' aria-busy='true' aria-label='Loading'>
			<Skeleton className='h-5 w-64' />
			<div className='grid gap-4 sm:grid-cols-2'>
				<Skeleton className='h-28 rounded-xl' />
				<Skeleton className='h-28 rounded-xl' />
			</div>
			<Skeleton className='h-64 rounded-xl' />
			<Skeleton className='h-80 rounded-xl' />
		</div>
	)
}
