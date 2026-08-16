import { Link } from '@tanstack/react-router'
import { ThemeToggle } from '@/components/theme-toggle'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { PACKAGE_URL, REPO_URL } from '@/lib/site'

/** Public-page footer: the legal pages and the source, plus the theme switch,
 *  which lives here because signed-out visitors have no settings page. The page
 *  around it supplies the container, so the rule matches its content width. */
export function SiteFooter() {
	return (
		<footer className='flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-border py-5 pb-10 font-mono text-xs text-muted-foreground/70'>
			<Link to='/' className='flex items-center gap-2 transition-colors hover:text-foreground'>
				<UsageFleetMark className='size-3.5' />
				USAGEFLEET
			</Link>
			<nav className='flex flex-wrap items-center gap-x-5 gap-y-2'>
				<Link to='/privacy' className='transition-colors hover:text-foreground'>
					PRIVACY
				</Link>
				<Link to='/terms' className='transition-colors hover:text-foreground'>
					TERMS
				</Link>
				<a href={REPO_URL} target='_blank' rel='noreferrer' className='transition-colors hover:text-foreground'>
					GITHUB
				</a>
				<a
					href={PACKAGE_URL}
					target='_blank'
					rel='noreferrer'
					className='transition-colors hover:text-foreground'
				>
					NPM
				</a>
			</nav>
			<ThemeToggle />
		</footer>
	)
}
