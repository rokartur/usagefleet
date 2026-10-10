import { useTheme } from 'next-themes'
import { useTranslations } from 'use-intl'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { useMounted } from '@/hooks/use-mounted'

const THEMES = ['system', 'light', 'dark'] as const

/** System/light/dark segmented control. Nothing is selected until after mount:
 *  the stored choice lives in localStorage, so the server has nothing to render
 *  and any guess would hydrate into a mismatch. */
export function ThemeToggle() {
	const t = useTranslations('common.theme')
	const { theme, setTheme } = useTheme()
	const mounted = useMounted()

	return (
		<SegmentedControl
			label={t('label')}
			value={mounted && theme ? theme : ''}
			onValueChange={setTheme}
			options={THEMES.map(value => ({ label: t(value), value }))}
		/>
	)
}
