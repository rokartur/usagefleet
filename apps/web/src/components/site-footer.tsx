import { Link } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import { LocaleToggle } from '@/components/locale-toggle'
import { ThemeToggle } from '@/components/theme-toggle'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { PACKAGE_URL, REPO_URL } from '@/lib/site'

/** Public-page footer: the legal pages and the source, plus the theme and
 *  language switches, which live here because signed-out visitors have no
 *  settings page. The page around it supplies the container, so the rule
 *  matches its content width. */
export function SiteFooter() {
	const t = useTranslations('common.footer')

	return (
		<footer className='flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-border py-6 pb-10 text-sm text-muted-foreground'>
			<Link
				to='/'
				className='flex items-center gap-2 font-medium text-foreground transition-opacity hover:opacity-70'
			>
				<UsageFleetMark className='size-4' />
				UsageFleet
			</Link>
			<nav className='flex flex-wrap items-center gap-x-5 gap-y-2'>
				<Link to='/privacy' className='transition-colors hover:text-foreground'>
					{t('privacy')}
				</Link>
				<Link to='/terms' className='transition-colors hover:text-foreground'>
					{t('terms')}
				</Link>
				<a href={REPO_URL} target='_blank' rel='noreferrer' className='transition-colors hover:text-foreground'>
					{t('github')}
				</a>
				<a
					href={PACKAGE_URL}
					target='_blank'
					rel='noreferrer'
					className='transition-colors hover:text-foreground'
				>
					{t('npm')}
				</a>
			</nav>
			{/* Wraps: the two switches side by side are wider than a 375px phone. */}
			<div className='flex flex-wrap items-center gap-2'>
				<LocaleToggle />
				<ThemeToggle />
			</div>
		</footer>
	)
}
