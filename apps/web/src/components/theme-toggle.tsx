import { useEffect, useState } from 'react'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const THEMES = [
	{ icon: MonitorIcon, label: 'System', value: 'system' },
	{ icon: SunIcon, label: 'Light', value: 'light' },
	{ icon: MoonIcon, label: 'Dark', value: 'dark' },
] as const

/** System/light/dark segmented control. Nothing is selected until after mount:
 *  the stored choice lives in localStorage, so the server has nothing to render
 *  and any guess would hydrate into a mismatch. */
export function ThemeToggle() {
	const { theme, setTheme } = useTheme()
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])

	return (
		<ToggleGroup
			variant='outline'
			size='sm'
			spacing={0}
			aria-label='Theme'
			value={mounted && theme ? [theme] : []}
			// Clicking the active segment clears the selection; keep the current theme.
			onValueChange={([next]) => next && setTheme(next)}
		>
			{THEMES.map(({ value, label, icon: Icon }) => (
				<ToggleGroupItem key={value} value={value}>
					<Icon />
					{label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	)
}
