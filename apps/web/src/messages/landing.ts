/** The marketing page: hero, the three setup steps, what the collector does,
 *  pricing, FAQ and the dashboard mockup. `meta` also feeds the structured
 *  data in `head()`, so a crawler reads the page in the language it was served. */
const en = {
	cta: { title: 'Stop guessing which machine ate the window.' },
	faq: {
		apiKeyA:
			'No. The collector uses the Claude login already sitting on the machine, reads the local Claude Code logs and the rate limit headers that come back with them.',
		apiKeyQ: 'Does this need an Anthropic API key?',
		downgradeA:
			'Devices over the new limit are parked, not deleted. Nothing is lost, and they report again with the same token as soon as they fit.',
		downgradeQ: 'What happens when I downgrade?',
		guardA: 'Never. Offline, timed out, junk response or a server too old to answer all exit clean. Only an explicit refusal stops a prompt.',
		guardQ: 'Does the guard block my work if you go down?',
		promptsA:
			'No. Prompts, responses and file contents never leave the machine. What is uploaded is counters plus context: token counts, model, session id, hostname, working directory and git branch.',
		promptsQ: 'Can you see my prompts?',
		splitA: 'Because a group is measured against its own slice of the account, not against the whole thing. Two groups, one using half of everything, means that group reads 100% of its budget while the account reads 50%.',
		splitQ: 'Why do the group percentages add up past the account number?',
		title: 'Questions people actually ask.',
	},
	hero: {
		badges: { prompts: 'Counters, never prompts', setup: 'Setup under a minute' },
		copy: 'Copy {command}',
		copied: 'Copied',
		headline: { many: 'many', machines: 'machines.', one: 'One', subscription: 'subscription,' },
		lead: "Anthropic reports one usage number. UsageFleet splits it per machine, live, from Claude's own headers.",
	},
	how: {
		lead: 'The collector uses the Claude login already on the machine. Nothing to configure, nothing to keep open.',
		specs: {
			privacy: {
				body: 'Prompts, responses and file contents never leave your machine. What does: token counts, model, session id, hostname, working directory and git branch.',
				title: 'Counters, not conversations',
			},
			source: {
				body: "The collector uses your existing local Claude login and reads unified 5 hour and 7 day utilization straight from Anthropic's response headers.",
				title: 'Rate limit headers, not guesses',
			},
			split: {
				body: 'Claude Code logs are deduped by uuid and folded per request, so billable tokens decide how the official total divides between your machines.',
				title: 'Groups get their real share',
			},
		},
		steps: {
			install: {
				body: 'Zero runtime dependencies, Node 20 and up, the same command on every OS.',
				title: 'Install the collector',
			},
			leave: {
				body: 'Autostarts with your session, tails the local logs, updates itself within six hours.',
				title: 'Leave it alone',
			},
			pair: {
				body: 'One token from the dashboard, shown once, stored as a hash on our side.',
				title: 'Pair the device',
			},
		},
		title: 'Three commands.',
		titleSecond: 'Then it is just running.',
	},
	meta: {
		offerFrom: 'from ',
		offerDevices: '{count, plural, one {# device} other {# devices}}',
		title: 'Coding agent usage tracker for your whole fleet',
	},
	mockup: {
		account: 'example account',
		acrossGroups: 'across {count, plural, one {# group} other {# groups}}',
		billable: 'billable, folded per request',
		devices: '{count, plural, one {# device} other {# devices}}',
		devicesReporting: 'Devices reporting',
		group: 'Group',
		// Sample data, so these read as names a user would have typed themselves.
		groupNames: { homeServer: 'Home server', laptops: 'Laptops', workDesktops: 'Work desktops' },
		groups: 'Groups',
		live: 'live',
		resetsSession: 'resets in 02:14',
		resetsWeekly: 'resets Mon 09:00',
		session: '5-hour session',
		sessionShort: 'Session (5h)',
		status: '· subscription · updated 12s ago',
		tokens: 'Tokens, this session',
		weekly: 'Weekly',
	},
	nav: { app: 'Dashboard', faq: 'FAQ', how: 'How it works', pricing: 'Pricing', signIn: 'Sign in' },
	pricing: {
		asManyGroups: 'as many groups',
		choose: 'Choose {plan}',
		// No `#`: the pricing table renders the number itself so it can keep its
		// mono/bold styling, and passes `count` only to pick the right form.
		devices: '{count, plural, one {device} other {devices}}',
		everyPlan: 'in every plan',
		everyPlanBody:
			'Live 5h and weekly windows, the per group split, per model breakdown, history, and the prompt guard.',
		groups: '{count, plural, one {group} other {groups}}',
		lead: 'Max groups matches your device count. Cancel any time, the free plan keeps working.',
		notes: { custom: 'bigger fleets', fleet: 'teams, CI, servers', free: 'start here', solo: 'most people' },
		perDevicePerMonth: '/ device / mo',
		perMonth: '/ mo',
		rangeTo: ' to ',
		start: 'Start {plan}',
		title: 'Simple plans.',
		titleSecond: 'Exact limits.',
	},
	primaryCta: { getStarted: 'Get started' },
}

const pl: typeof en = {
	cta: { title: 'Przestań zgadywać, która maszyna zjadła okno.' },
	faq: {
		apiKeyA:
			'Nie. Kolektor korzysta z logowania do Claude, które już jest na maszynie, czyta lokalne logi Claude Code i nagłówki limitów, które wracają razem z nimi.',
		apiKeyQ: 'Czy potrzebny jest klucz API Anthropic?',
		downgradeA:
			'Urządzenia ponad nowy limit są parkowane, a nie usuwane. Nic nie ginie i raportują znowu z tym samym tokenem, gdy tylko się zmieszczą.',
		downgradeQ: 'Co się dzieje, gdy obniżę plan?',
		guardA: 'Nigdy. Brak sieci, przekroczony czas, śmieciowa odpowiedź albo zbyt stary serwer kończą się czysto. Tylko wyraźna odmowa zatrzymuje prompt.',
		guardQ: 'Czy strażnik zablokuje mi pracę, gdy padniecie?',
		promptsA:
			'Nie. Prompty, odpowiedzi i zawartość plików nigdy nie opuszczają maszyny. Wysyłane są liczniki i kontekst: liczba tokenów, model, id sesji, nazwa hosta, katalog roboczy i gałąź gita.',
		promptsQ: 'Czy widzicie moje prompty?',
		splitA: 'Bo grupę mierzymy względem jej własnego udziału w koncie, a nie względem całości. Dwie grupy, z których jedna zużywa połowę wszystkiego, oznaczają, że ta grupa pokazuje 100% swojego budżetu, a konto 50%.',
		splitQ: 'Dlaczego procenty grup sumują się powyżej wartości konta?',
		title: 'Pytania, które naprawdę padają.',
	},
	hero: {
		badges: { prompts: 'Liczniki, nigdy prompty', setup: 'Konfiguracja poniżej minuty' },
		copy: 'Skopiuj {command}',
		copied: 'Skopiowano',
		headline: { many: 'wiele', machines: 'maszyn.', one: 'Jedna', subscription: 'subskrypcja,' },
		lead: 'Anthropic podaje jedną liczbę zużycia. UsageFleet dzieli ją na maszyny, na żywo, z nagłówków samego Claude.',
	},
	how: {
		lead: 'Kolektor korzysta z logowania do Claude, które już jest na maszynie. Nic do konfiguracji, nic do trzymania otwartego.',
		specs: {
			privacy: {
				body: 'Prompty, odpowiedzi i zawartość plików nigdy nie opuszczają twojej maszyny. Opuszczają ją: liczba tokenów, model, id sesji, nazwa hosta, katalog roboczy i gałąź gita.',
				title: 'Liczniki, nie rozmowy',
			},
			source: {
				body: 'Kolektor korzysta z twojego lokalnego logowania do Claude i czyta wspólne wykorzystanie z okien 5-godzinnego i 7-dniowego prosto z nagłówków odpowiedzi Anthropic.',
				title: 'Nagłówki limitów, nie zgadywanie',
			},
			split: {
				body: 'Logi Claude Code są odsiewane po uuid i składane per żądanie, więc to płatne tokeny decydują, jak oficjalna suma dzieli się między twoje maszyny.',
				title: 'Grupy dostają swój prawdziwy udział',
			},
		},
		steps: {
			install: {
				body: 'Zero zależności w czasie działania, Node 20 wzwyż, to samo polecenie na każdym systemie.',
				title: 'Zainstaluj kolektor',
			},
			leave: {
				body: 'Startuje z twoją sesją, śledzi lokalne logi, aktualizuje się w ciągu sześciu godzin.',
				title: 'Zostaw go w spokoju',
			},
			pair: {
				body: 'Jeden token z pulpitu, pokazany raz, u nas trzymany jako hash.',
				title: 'Sparuj urządzenie',
			},
		},
		title: 'Trzy polecenia.',
		titleSecond: 'Potem po prostu działa.',
	},
	meta: {
		offerFrom: 'od ',
		offerDevices: '{count, plural, one {# urządzenie} few {# urządzenia} many {# urządzeń} other {# urządzenia}}',
		title: 'Śledzenie zużycia agentów kodujących na całej flocie',
	},
	mockup: {
		account: 'konto przykładowe',
		acrossGroups: 'w {count, plural, one {# grupie} few {# grupach} many {# grupach} other {# grupach}}',
		billable: 'płatne, składane per żądanie',
		devices: '{count, plural, one {# urządzenie} few {# urządzenia} many {# urządzeń} other {# urządzenia}}',
		devicesReporting: 'Raportujące urządzenia',
		group: 'Grupa',
		groupNames: { homeServer: 'Serwer domowy', laptops: 'Laptopy', workDesktops: 'Komputery służbowe' },
		groups: 'Grupy',
		live: 'na żywo',
		resetsSession: 'reset za 02:14',
		resetsWeekly: 'reset w pon. 09:00',
		session: 'Sesja 5-godzinna',
		sessionShort: 'Sesja (5h)',
		status: '· subskrypcja · aktualizacja 12 s temu',
		tokens: 'Tokeny w tej sesji',
		weekly: 'Tygodniowe',
	},
	nav: { app: 'Pulpit', faq: 'FAQ', how: 'Jak to działa', pricing: 'Cennik', signIn: 'Zaloguj się' },
	pricing: {
		asManyGroups: 'dowolnie wiele grup',
		choose: 'Wybierz {plan}',
		devices: '{count, plural, one {urządzenie} few {urządzenia} many {urządzeń} other {urządzenia}}',
		everyPlan: 'w każdym planie',
		everyPlanBody:
			'Okna 5-godzinne i tygodniowe na żywo, podział na grupy, rozbicie na modele, historia i strażnik promptów.',
		groups: '{count, plural, one {grupa} few {grupy} many {grup} other {grupy}}',
		lead: 'Maksymalna liczba grup równa się liczbie urządzeń. Anuluj w każdej chwili, plan Free działa dalej.',
		notes: {
			custom: 'większe floty',
			fleet: 'zespoły, CI, serwery',
			free: 'zacznij tutaj',
			solo: 'dla większości',
		},
		perDevicePerMonth: '/ urządzenie / mies.',
		perMonth: '/ mies.',
		rangeTo: ' do ',
		start: 'Uruchom {plan}',
		title: 'Proste plany.',
		titleSecond: 'Dokładne limity.',
	},
	primaryCta: { getStarted: 'Zacznij' },
}

export const landing = { en, pl }
