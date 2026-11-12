import { definePlugin } from 'nitro'
import { sendDueResetPushes } from '../lib/reset-push'

// One sweep a minute; in-process like the rate limits, so it assumes one web instance.
export default definePlugin(() => {
	setInterval(() => {
		sendDueResetPushes(new Date()).catch(error => console.error('reset push sweep failed', error))
	}, 60_000)
})
