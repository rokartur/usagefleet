import { createTranslator } from 'use-intl'
import { expect, test } from 'vitest'
import { LOCALES } from '@/lib/i18n'
import { MESSAGES } from '@/messages'

/** The rich messages the dashboard renders through `t.rich`. A tag named in the
 *  catalog but not supplied by the component surfaces only when that message is
 *  formatted, so every locale gets formatted here instead of on a user's screen.
 *  Tags render to their chunks, which keeps this about wiring, not markup. */
const RICH = [
	['dash.admin.user', 'viewing', { email: 'a@b.c', mark: String }],
	['dash.settings', 'signInMethodsDescription', { email: 'a@b.c', mark: String }],
	['dash.settings.delete', 'adminBlocked', { env: String }],
	['dash.settings.delete', 'subscribed', { cancel: String, mark: String, plan: 'solo' }],
	['dash.groups', 'blockingHint', { cmd: String }],
] as const

test.each(LOCALES.flatMap(locale => RICH.map(message => [locale, ...message] as const)))(
	'%s formats %s.%s',
	(locale, namespace, key, values) => {
		const t = createTranslator({ locale, messages: MESSAGES[locale], namespace })
		// use-intl reports a missing tag by returning the bare key, so asserting the
		// output merely exists would pass on exactly the failure this test is for.
		expect(t.rich(key, values)).not.toBe(`${namespace}.${key}`)
	},
)

/** ICU arguments the components pass positionally, where a renamed placeholder
 *  would silently print the fallback instead of the value. */
test.each(LOCALES)('%s interpolates the values the dashboard passes', locale => {
	const t = createTranslator({ locale, messages: MESSAGES[locale] })
	expect(t('dash.groups.slots', { share: 3 })).toContain('3')
	expect(t('dash.groups.deleted', { name: 'Laptops' })).toContain('Laptops')
	expect(t('dash.admin.lead', { count: 7, fallback: 1 })).toContain('7')
	expect(t('dash.limits.deviceLimitReached', { limit: 2 })).toContain('2')
	expect(t('dash.settings.mailSentHint', { email: 'a@b.c' })).toContain('a@b.c')
})
