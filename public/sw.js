self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }

  const title = data.title || 'Context'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'You have a new update in Context.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.eventId || undefined,
    data: { url: data.url || '/', eventId: data.eventId || null },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  const eventId = event.notification.data?.eventId
  const markRead = eventId
    ? fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', eventId }),
      }).catch(() => undefined)
    : Promise.resolve()

  event.waitUntil(Promise.all([
    markRead,
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const existing = windowClients.find(client => new URL(client.url).origin === self.location.origin)
      if (existing) {
        existing.navigate(target)
        return existing.focus()
      }
      return clients.openWindow(target)
    }),
  ]))
})
