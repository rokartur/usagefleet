import { useState } from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useTranslations } from 'use-intl'
import { DropdownMenu } from '@/components/arc/dropdown-menu/dropdown-menu'
import { useToast } from '@/components/arc/toast-stack/toast-stack'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { signOut } from '@/lib/auth-client'

// `key` indexes common.nav, so a label never gets written twice. Kept literal
// (no widening annotation) so a typo fails the `t()` call at compile time.
const NAV = [
	{ href: '/dashboard', key: 'dashboard' },
	{ href: '/fleet', key: 'fleet' },
	{ href: '/account', key: 'account' },
	// Rendered only for ADMIN_EMAILS accounts, but listed here unconditionally so
	// PageTitle can name the page it is on.
	{ href: '/admin', key: 'admin' },
] as const satisfies { href: string; key: string }[]

/** The shell's single <h1>: the tabs already show where you are, so it is for
 *  screen readers only. */
export function PageTitle() {
	const t = useTranslations('common.nav')
	const pathname = useRouterState({ select: state => state.location.pathname })
	const current = NAV.find(n => pathname.startsWith(n.href))
	return <h1 className='sr-only'>{t(current?.key ?? 'dashboard')}</h1>
}

function UserMenu({ email }: { email: string }) {
	const t = useTranslations('common.user')
	const router = useRouter()
	const toast = useToast()
	const [pending, setPending] = useState(false)

	async function signOutAndLeave() {
		setPending(true)
		const request = (async () => {
			const result = await signOut()
			if (result.error) {
				throw new Error('Sign out failed')
			}
		})()
		try {
			await toast.promise(request, {
				error: { description: t('signOutFailedHint'), title: t('signOutFailed') },
				loading: { title: t('signingOut') },
				success: { title: t('signedOut') },
			})
		} catch {
			// Keep the existing best-effort redirect; the toast reports the failure.
		} finally {
			await router.invalidate()
			await router.navigate({ to: '/login' })
			setPending(false)
		}
	}

	return (
		<DropdownMenu
			label={email}
			items={[
				{
					destructive: true,
					disabled: pending,
					icon: <LogOut size={15} />,
					label: t('signOut'),
					onSelect: signOutAndLeave,
				},
			]}
		/>
	)
}

export function AppTopbar({ email, isAdmin }: { email: string; isAdmin: boolean }) {
	const t = useTranslations('common')
	return (
		<header className='sticky top-0 z-20 h-13 border-b bg-background/85 backdrop-blur'>
			<div className='flex h-full items-center gap-5 px-4 sm:gap-7 md:px-6'>
				<Link
					to='/dashboard'
					className='flex items-center gap-2 font-heading font-medium'
					aria-label='UsageFleet'
				>
					<UsageFleetMark className='size-4.5' />
					<span className='hidden sm:inline'>UsageFleet</span>
				</Link>
				<nav aria-label={t('nav.label')} className='flex gap-0.5'>
					{NAV.filter(n => isAdmin || n.href !== '/admin').map(n => (
						<Link
							key={n.href}
							to={n.href}
							className='flex min-h-(--control-height-sm) items-center rounded-(--radius-control) px-3 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground'
						>
							{t(`nav.${n.key}`)}
						</Link>
					))}
				</nav>
				<div className='ml-auto'>
					<UserMenu email={email} />
				</div>
			</div>
		</header>
	)
}
