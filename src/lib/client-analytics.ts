export function trackClientEvent(eventName: string, properties: Record<string, unknown> = {}) {
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: eventName, properties }),
    keepalive: true,
  }).catch(() => {})
}
