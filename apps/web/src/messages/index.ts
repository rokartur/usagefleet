import { auth } from './auth'
import { billing } from './billing'
import { common } from './common'
import { dash } from './dash'
import { landing } from './landing'

/** Every namespace carries its own `en`/`pl` pair so the two languages sit next
 *  to each other in review, and so each area of the app is one file. Assembled
 *  here into the shape use-intl wants: locale first, namespace second. */
const NAMESPACES = { auth, billing, common, dash, landing }

export const MESSAGES = {
	en: {
		auth: NAMESPACES.auth.en,
		billing: NAMESPACES.billing.en,
		common: NAMESPACES.common.en,
		dash: NAMESPACES.dash.en,
		landing: NAMESPACES.landing.en,
	},
	pl: {
		auth: NAMESPACES.auth.pl,
		billing: NAMESPACES.billing.pl,
		common: NAMESPACES.common.pl,
		dash: NAMESPACES.dash.pl,
		landing: NAMESPACES.landing.pl,
	},
}
