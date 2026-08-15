import { useEffect } from 'react'
import { createRouter } from '@tanstack/react-router'
import { TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
