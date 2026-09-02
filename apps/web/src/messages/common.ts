/** Shell and shared chrome: header, footer, sidebar, error and 404 screens,
 *  plus the meta description every page falls back to. */
const en = {
	backToSite: 'Back to site',
	error: {
		description: "We couldn't load this page. This is usually temporary.",
		retry: 'Try again',
		title: 'Something went wrong',
	},
	footer: { github: 'GITHUB', npm: 'NPM', privacy: 'PRIVACY', terms: 'TERMS' },
	language: { en: 'English', label: 'Language', pl: 'Polski' },
	loading: 'Loading',
	nav: {
		admin: 'Admin',
		billing: 'Billing',
		dashboard: 'Dashboard',
		devices: 'Devices',
		groups: 'Groups',
		overview: 'Overview',
		settings: 'Settings',
	},
	notFound: {
		devices: 'reporting, unaffected',
		devicesLabel: 'devices',
		goToDashboard: 'Go to dashboard',
		home: 'Home',
		lead: 'The link is dead or the page moved. Your collectors kept running the whole time.',
		notFound: 'not found',
		resolving: 'resolving route',
		status: 'status',
		title: 'No route by that name.',
		usage: 'nothing lost',
		usageLabel: 'usage',
	},
	siteDescription:
		'Track coding agent token usage and rate limits across every machine on one subscription. Live 5-hour and weekly windows, split per device and per group.',
	tagline: 'Usage across groups and devices',
	theme: { dark: 'Dark', label: 'Theme', light: 'Light', system: 'System' },
	user: {
		signOut: 'Sign out',
		signOutFailed: "Couldn't sign out",
		signOutFailedHint: 'Please sign in again if your session remains active.',
		signedIn: 'Signed in',
		signedOut: 'Signed out',
		signingOut: 'Signing out…',
	},
}

const pl: typeof en = {
	backToSite: 'Wróć na stronę',
	error: {
		description: 'Nie udało się wczytać tej strony. Zwykle to chwilowy problem.',
		retry: 'Spróbuj ponownie',
		title: 'Coś poszło nie tak',
	},
	footer: { github: 'GITHUB', npm: 'NPM', privacy: 'PRYWATNOŚĆ', terms: 'REGULAMIN' },
	language: { en: 'English', label: 'Język', pl: 'Polski' },
	loading: 'Wczytywanie',
	nav: {
		admin: 'Administracja',
		billing: 'Płatności',
		dashboard: 'Pulpit',
		devices: 'Urządzenia',
		groups: 'Grupy',
		overview: 'Przegląd',
		settings: 'Ustawienia',
	},
	notFound: {
		devices: 'raportują, bez zmian',
		devicesLabel: 'urządzenia',
		goToDashboard: 'Przejdź do pulpitu',
		home: 'Strona główna',
		lead: 'Link jest martwy albo strona się przeniosła. Twoje kolektory działały przez cały czas.',
		notFound: 'nie znaleziono',
		resolving: 'szukanie trasy',
		status: 'status',
		title: 'Nie ma takiej strony.',
		usage: 'nic nie zginęło',
		usageLabel: 'zużycie',
	},
	siteDescription:
		'Śledź zużycie tokenów i limity agentów kodujących na wszystkich maszynach w jednej subskrypcji. Okna 5-godzinne i tygodniowe na żywo, w podziale na urządzenia i grupy.',
	// Shorter than a literal translation on purpose: the sidebar clips around 30
	// characters and the full phrase rendered with an ellipsis.
	tagline: 'Zużycie grup i urządzeń',
	theme: { dark: 'Ciemny', label: 'Motyw', light: 'Jasny', system: 'Systemowy' },
	user: {
		signOut: 'Wyloguj się',
		signOutFailed: 'Nie udało się wylogować',
		signOutFailedHint: 'Jeśli sesja nadal działa, zaloguj się ponownie.',
		signedIn: 'Zalogowano',
		signedOut: 'Wylogowano',
		signingOut: 'Wylogowywanie…',
	},
}

export const common = { en, pl }
