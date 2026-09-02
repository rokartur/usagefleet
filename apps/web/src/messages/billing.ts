/** The billing page and the two Stripe buttons. Amounts never appear literally
 *  here: they arrive as ICU parameters already formatted in the reader's
 *  currency, so no string in this file may carry a currency symbol. */
const en = {
	buttons: {
		checkoutFailed: "Couldn't open checkout. Please try again.",
		manageBilling: 'Manage billing',
		portalFailed: "Couldn't open the billing portal. Please try again.",
	},
	change: {
		cancelToReturn: 'Cancel your subscription to return here.',
		current: 'Current',
		devices: '{count, plural, one {# device} other {# devices}}',
		lead: 'Billed monthly, cancel any time. Revoked devices never count toward the cap, and dropping to a smaller plan keeps existing devices reporting, it only blocks new ones.',
		subscribe: 'Subscribe',
		switch: 'Switch',
		title: 'Change plan',
		yourPlan: 'Your plan',
	},
	current: {
		cancels: 'Cancels at period end',
		ends: 'Ends',
		label: 'Current plan',
		pastDue: 'Payment failed',
		perMonth: '/mo',
		renews: 'Renews',
	},
	custom: {
		deviceCountLabel: 'Devices',
		devices: 'devices',
		fewer: 'One device fewer',
		lead: '{price} per device, from {min}. Pick any number up to {max} and the price follows.',
		more: 'One device more',
		updateDevices: 'Update devices',
	},
	dev: {
		apply: 'Apply',
		applying: 'Applying plan',
		clear: 'Clear subscription',
		cleared: 'Subscription cleared',
		clearing: 'Clearing subscription',
		devices: 'Devices (custom only)',
		lead: 'Writes the subscription row the Stripe webhook would write. Clearing is local only, so a real test subscription comes back on its next webhook.',
		plan: 'Plan',
		planApplied: 'Plan applied',
		title: 'Dev tools',
	},
	meter: {
		active: 'Active devices',
		overCap:
			"{count, plural, one {# device} other {# devices}} over this plan's cap. They keep reporting, but no new device can join.",
		slotsLeft: '{count, plural, one {# slot} other {# slots}} left. Revoking a device frees its slot immediately.',
		usedOf: '{used} of {limit}',
		noSlots: 'No slots left. Revoke a device or move up a plan to add another.',
	},
}

const pl: typeof en = {
	buttons: {
		checkoutFailed: 'Nie udało się otworzyć płatności. Spróbuj ponownie.',
		manageBilling: 'Zarządzaj płatnościami',
		portalFailed: 'Nie udało się otworzyć panelu płatności. Spróbuj ponownie.',
	},
	change: {
		cancelToReturn: 'Anuluj subskrypcję, aby tu wrócić.',
		current: 'Obecny',
		devices: '{count, plural, one {# urządzenie} few {# urządzenia} many {# urządzeń} other {# urządzenia}}',
		lead: 'Rozliczenie miesięczne, możesz anulować w każdej chwili. Odwołane urządzenia nigdy nie liczą się do limitu, a przejście na mniejszy plan nie przerywa raportowania istniejących urządzeń, blokuje tylko dodawanie nowych.',
		subscribe: 'Subskrybuj',
		switch: 'Zmień',
		title: 'Zmień plan',
		yourPlan: 'Twój plan',
	},
	current: {
		cancels: 'Wygasa na koniec okresu',
		ends: 'Kończy się',
		label: 'Obecny plan',
		pastDue: 'Płatność nie powiodła się',
		perMonth: '/mies.',
		renews: 'Odnawia się',
	},
	custom: {
		deviceCountLabel: 'Urządzenia',
		devices: 'urządzeń',
		fewer: 'Jedno urządzenie mniej',
		lead: '{price} za urządzenie, od {min}. Wybierz dowolną liczbę do {max}, a cena za nią pójdzie.',
		more: 'Jedno urządzenie więcej',
		updateDevices: 'Zmień liczbę urządzeń',
	},
	dev: {
		apply: 'Zastosuj',
		applying: 'Stosowanie planu',
		clear: 'Wyczyść subskrypcję',
		cleared: 'Subskrypcja wyczyszczona',
		clearing: 'Czyszczenie subskrypcji',
		devices: 'Urządzenia (tylko Custom)',
		lead: 'Zapisuje wiersz subskrypcji, który zapisałby webhook Stripe. Czyszczenie działa tylko lokalnie, więc prawdziwa testowa subskrypcja wróci przy kolejnym webhooku.',
		plan: 'Plan',
		planApplied: 'Plan zastosowany',
		title: 'Narzędzia dev',
	},
	meter: {
		active: 'Aktywne urządzenia',
		overCap:
			'{count, plural, one {# urządzenie} few {# urządzenia} many {# urządzeń} other {# urządzenia}} ponad limit tego planu. Raportują dalej, ale nowe już nie dołączy.',
		slotsLeft:
			'{count, plural, one {Zostało # wolne stanowisko} few {Zostały # wolne stanowiska} many {Zostało # wolnych stanowisk} other {Zostało # wolnych stanowisk}}. Odwołanie urządzenia natychmiast zwalnia jego stanowisko.',
		usedOf: '{used} z {limit}',
		noSlots: 'Brak wolnych stanowisk. Odwołaj urządzenie albo przejdź na wyższy plan, aby dodać kolejne.',
	},
}

export const billing = { en, pl }
