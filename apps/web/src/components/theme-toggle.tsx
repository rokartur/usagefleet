import { useEffect, useState } from 'react'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'use-intl'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const THEMES = [
	{ icon: MonitorIcon, value: 'system' },
	{ icon: SunIcon, value: 'light' },
	{ icon: MoonIcon, value: 'dark' },
] as const

/** System/light/dark segmented control. Nothing is selected until after mount:
 *  the stored choice lives in localStorage, so the server has nothing to render
 *  and any guess would hydrate into a mismatch. */
export function ThemeToggle() {
	const t = useTranslations('common.theme')
	const { theme, setTheme } = useTheme()
	const [mounted, setMounted] = useState(false)
	// oxlint-disable-next-line react/react-compiler -- the mount flag is the point
	useEffect(() => setMounted(true), [])

	return (
		<ToggleGroup
			variant='outline'
			size='sm'
			spacing={0}
			aria-label={t('label')}
			value={mounted && theme ? [theme] : []}
			// Clicking the active segment clears the selection; keep the current theme.
			onValueChange={([next]) => next && setTheme(next)}
		>
			{THEMES.map(({ value, icon: Icon }) => (
				<ToggleGroupItem key={value} value={value}>
					<Icon />
					{t(value)}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	)
}
