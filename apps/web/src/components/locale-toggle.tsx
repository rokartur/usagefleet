import { useLocale, useTranslations } from 'use-intl'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LOCALE_COOKIE, LOCALES } from '@/lib/i18n'

/** English/Polish segmented control. The choice is a cookie rather than state
 *  because the server reads it to render the first paint and to pick the
 *  billing currency. Reloading rather than re-rendering keeps that one read:
 *  switching language is rare, and a full pass means the shell, every loader
 *  and the meta tags all come back in the new locale with no second source of
 *  truth to keep in sync. */
export function LocaleToggle() {
	const locale = useLocale()
	const t = useTranslations('common.language')

	return (
		<ToggleGroup
			variant='outline'
			size='sm'
			spacing={0}
			aria-label={t('label')}
			value={[locale]}
			onValueChange={([next]) => {
				if (!next || next === locale) {
					return
				}
				// oxlint-disable-next-line unicorn/no-document-cookie -- the server reads this one on the next request; a library for a single write is not worth it
				document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`
				window.location.reload()
			}}
		>
			{LOCALES.map(value => (
				<ToggleGroupItem key={value} value={value}>
					{t(value)}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	)
}
