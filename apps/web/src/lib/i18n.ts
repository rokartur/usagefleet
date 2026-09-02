import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { hasLocale } from 'use-intl'
import type { MESSAGES } from '@/messages'

export const LOCALES = ['en', 'pl'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Read on the server to pick the locale, written by the client switcher. Not
 *  httpOnly on purpose: the switcher sets it without a round trip. */
export const LOCALE_COOKIE = 'uf_locale'

/** Teaches `useTranslations` which keys exist and `useLocale` what it returns,
 *  so a typo in a message key is a build error rather than a raw key on screen. */
declare module 'use-intl' {
	interface AppConfig {
		Locale: Locale
		Messages: (typeof MESSAGES)['en']
	}
}

/** What each locale is billed in. Stripe still owns the amounts — this only
 *  says which of a price's `currency_options` to read. */
export const LOCALE_CURRENCY: Record<Locale, string> = { en: 'usd', pl: 'pln' }

/** Highest-q supported language in an Accept-Language header. Sorting by q
 *  matters: "en-US,en;q=0.9,pl;q=0.8" is an English speaker who also reads
 *  Polish, and a substring test would serve them the wrong site. */
function preferredLanguage(header: string): Locale | undefined {
	return header
		.split(',')
		.map(part => {
			const [tag = '', ...params] = part.trim().split(';')
			const q = params.find(p => p.trim().startsWith('q='))
			return { quality: q ? Number(q.trim().slice(2)) : 1, tag: tag.toLowerCase().split('-')[0] ?? '' }
		})
		.filter(entry => hasLocale(LOCALES, entry.tag) && Number.isFinite(entry.quality) && entry.quality > 0)
		.toSorted((a, b) => b.quality - a.quality)
		.at(0)?.tag as Locale | undefined
}

/** An explicit choice beats the browser's guess; the browser beats the default. */
export function resolveLocale(cookie: string, languages: string): Locale {
	const chosen = cookie
		.split(';')
		.map(c => c.trim().split('='))
		.find(([name]) => name === LOCALE_COOKIE)
		?.at(1)
	return hasLocale(LOCALES, chosen) ? chosen : (preferredLanguage(languages) ?? DEFAULT_LOCALE)
}

/** Resolved on whichever side is rendering, so navigating does not cost a round
 *  trip to ask the server what language it already served. The two inputs are
 *  the same preference seen from two places: the browser builds Accept-Language
 *  from `navigator.languages`, so both sides land on the same locale and
 *  hydration matches. */
export const detectLocale = createIsomorphicFn()
	.server(() => {
		const { headers } = getRequest()
		return resolveLocale(headers.get('cookie') ?? '', headers.get('accept-language') ?? '')
	})
	.client(() => resolveLocale(document.cookie, navigator.languages.join(',')))
