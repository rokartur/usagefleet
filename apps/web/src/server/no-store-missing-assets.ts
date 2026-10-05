import { definePlugin } from 'nitro'

// Nitro's /assets/** route rule stamps "immutable, max-age=1y" on every status. A chunk requested mid-deploy
// 404s, and Cloudflare plus the browser then keep that 404 for a year, so the dashboard never loads again.
export default definePlugin(nitroApp => {
	nitroApp.hooks.hook('response', (res, event) => {
		if (res.status >= 400 && new URL(event.req.url).pathname.startsWith('/assets/')) {
			res.headers.set('cache-control', 'no-store')
		}
	})
})
