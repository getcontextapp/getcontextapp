self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }

  const title = data.title || 'Context'
  const plannedActivityId = typeof data.plannedActivityId === 'string' ? data.plannedActivityId : null
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'You have a new update in Context.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.eventId || undefined,
    data: { url: data.url || '/', eventId: data.eventId || null, plannedActivityId },
    actions: plannedActivityId
      ? [
          { action: 'done', title: 'Done' },
          { action: 'later', title: 'Later' },
        ]
      : [],
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin)
  const eventId = event.notification.data?.eventId
  const plannedActivityId = event.notification.data?.plannedActivityId
  const action = event.action

  const markRead = () => eventId
    ? fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'mark_read', eventId }),
      }).catch(() => undefined)
    : Promise.resolve()

  const openApp = () => clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const existing = windowClients.find(client => new URL(client.url).origin === self.location.origin)
      if (existing) {
        existing.navigate(targetUrl.href)
        return existing.focus()
      }
      return clients.openWindow(targetUrl.href)
    })

  if ((action === 'done' || action === 'later') && plannedActivityId) {
    const taskAction = action === 'done' ? 'confirm' : 'not_now'
    event.waitUntil(fetch('/api/planned-activities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id: plannedActivityId,
        action: taskAction,
        source: 'notification_action',
        notification_event_id: eventId || null,
      }),
    }).then(async response => {
      if (!response.ok) throw new Error('Notification action failed')
      await markRead()
    }).catch(() => {
      targetUrl.searchParams.set('notificationTask', plannedActivityId)
      if (eventId) targetUrl.searchParams.set('notificationEvent', eventId)
      return openApp()
    }))
    return
  }

  if (plannedActivityId) targetUrl.searchParams.set('notificationTask', plannedActivityId)
  if (eventId) targetUrl.searchParams.set('notificationEvent', eventId)
  event.waitUntil(Promise.all([markRead(), openApp()]))
})
