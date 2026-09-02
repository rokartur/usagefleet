import { Link } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import { buttonVariants } from '@/components/ui/button'
import { UsageFleetMark } from '@/components/usage-fleet-mark'

/** Header for the public pages that aren't the landing page: wordmark and one
 *  way back. The landing page keeps its own, because only it has section
 *  anchors and an auth-aware button. */
export function SiteHeader() {
	const t = useTranslations('common')

	return (
		<header className='sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md'>
			<div className='mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6'>
				<Link
					to='/'
					className='flex items-center gap-2 font-semibold tracking-tight transition-opacity hover:opacity-70'
				>
					<UsageFleetMark className='size-5' />
					UsageFleet
				</Link>
				<Link to='/' className={buttonVariants({ variant: 'outline' })}>
					{t('backToSite')}
				</Link>
			</div>
		</header>
	)
}
