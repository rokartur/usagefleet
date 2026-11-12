// Reset pushes from lib/reset-push.ts: the payload is { title, body }.
self.addEventListener('push', event => {
	const { title, body } = event.data.json()
	event.waitUntil(self.registration.showNotification(title, { body, icon: '/apple-touch-icon.png', tag: title }))
})

self.addEventListener('notificationclick', event => {
	event.notification.close()
	event.waitUntil(self.clients.openWindow('/dashboard'))
})
