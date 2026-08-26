'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type NotificationEvent = {
  id: string
  category: string
  title: string
  body: string
  url: string
  sent_at: string | null
  read_at: string | null
  created_at: string
}

type NotificationState = {
  eligible: boolean
  configured?: boolean
  publicKey?: string
  subscriptionCount?: number
  preferences?: {
    push_enabled: boolean
    detailed_content: boolean
  }
  events?: NotificationEvent[]
}

function applicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)))
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    test: 'Test', morning: 'Morning', due: 'Reminder', reentry: 'Check-in',
    summary: 'Summary', calendar: 'Coming up', care_partner: 'Household', admin: 'Admin',
  }
  return labels[category] ?? 'Update'
}

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export default function NotificationUpdates() {
  const [state, setState] = useState<NotificationState | null>(null)
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [supported, setSupported] = useState(true)
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false)
  const [deviceSubscribed, setDeviceSubscribed] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' })
      if (!response.ok) return
      const result = await response.json() as NotificationState
      setState(result)
    } catch {
      // Notification setup must never block the primary Context experience.
    }
  }, [])

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
    setIosNeedsInstall(isIosDevice() && !isStandaloneApp())
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration('/sw.js')
        .then(registration => registration?.pushManager.getSubscription())
        .then(subscription => setDeviceSubscribed(Boolean(subscription)))
    }
    void load()
  }, [load])

  const events = useMemo(() => state?.events ?? [], [state?.events])
  const unread = events.some(event => !event.read_at)
  if (!state?.eligible) return null

  async function openUpdates() {
    setOpen(true)
    if (!unread) return
    setState(current => current ? {
      ...current,
      events: current.events?.map(event => ({ ...event, read_at: event.read_at ?? new Date().toISOString() })),
    } : current)
    await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    })
  }

  async function enablePush() {
    const publicKey = state?.publicKey
    if (!supported || !publicKey || iosNeedsInstall) return
    setWorking(true)
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications were not allowed on this device.')
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      })
      const response = await fetch('/api/notifications/subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not enable notifications.')
      setMessage('Notifications are enabled on this device.')
      setDeviceSubscribed(true)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not enable notifications.')
    } finally {
      setWorking(false)
    }
  }

  async function disablePush() {
    setWorking(true)
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js')
      const subscription = await registration?.pushManager.getSubscription()
      await fetch('/api/notifications/subscription', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription?.endpoint }),
      })
      await subscription?.unsubscribe()
      setMessage('Notifications are off on this device.')
      setDeviceSubscribed(false)
      await load()
    } finally {
      setWorking(false)
    }
  }

  async function sendTest() {
    setWorking(true)
    setMessage('')
    try {
      const response = await fetch('/api/notifications/test', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not send the test.')
      setMessage('Test sent. It may take a few seconds to arrive.')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the test.')
    } finally {
      setWorking(false)
    }
  }

  async function setDetailedContent(enabled: boolean) {
    const response = await fetch('/api/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detailedContent: enabled }),
    })
    if (response.ok) await load()
  }

  const enabled = deviceSubscribed

  return (
    <>
      <button
        type="button"
        onClick={() => void openUpdates()}
        className="relative min-h-9 rounded-full bg-cream-200 px-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-warm-700 hover:bg-cream-300 focus:outline-none focus:ring-2 focus:ring-sage-300 transition-colors"
        title="Updates"
        aria-label={unread ? 'Open updates, new update available' : 'Open updates'}
      >
        <span aria-hidden="true">🔔</span>
        <span className="hidden min-[430px]:inline">Updates</span>
        {unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-sage-500 ring-2 ring-cream-100" aria-hidden="true" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center" onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
          <div className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm" />
          <section className="relative w-full max-w-lg mx-auto bg-cream-50 rounded-t-3xl sm:rounded-3xl pt-2 pb-10 px-6 shadow-float max-h-[92svh] overflow-y-auto" aria-label="Updates and notification settings">
            <div className="w-10 h-1 bg-warm-300 rounded-pill mx-auto mb-6" />
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-sage-600">Context</p>
                <h2 className="font-serif text-2xl font-semibold text-warm-900">Updates</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 min-w-11 text-warm-400 hover:text-warm-700 text-2xl" aria-label="Close updates">×</button>
            </div>

            <div className="rounded-2xl border border-cream-300 bg-white p-4">
              <h3 className="font-semibold text-warm-900">Notifications on this device</h3>
              <p className="mt-1 text-sm leading-5 text-warm-500">Gentle reminders can appear even when Context is closed.</p>
              {!state.configured && <p className="mt-3 rounded-xl bg-cream-100 p-3 text-sm text-warm-600">Push delivery is being prepared for this pilot.</p>}
              {!supported && <p className="mt-3 rounded-xl bg-cream-100 p-3 text-sm text-warm-600">This browser does not support app notifications.</p>}
              {iosNeedsInstall && (
                <p className="mt-3 rounded-xl bg-sage-50 p-3 text-sm leading-5 text-sage-700">
                  On iPhone, first use Share → Add to Home Screen. Open Context from its Home Screen icon, then return here.
                </p>
              )}
              <button
                type="button"
                onClick={() => void (enabled ? disablePush() : enablePush())}
                disabled={working || !supported || !state.configured || iosNeedsInstall}
                className="mt-4 min-h-12 w-full rounded-xl bg-warm-700 px-4 font-semibold text-cream-50 disabled:opacity-50"
              >
                {working ? 'Please wait…' : enabled ? 'Turn off on this device' : 'Enable notifications'}
              </button>
              {enabled && (
                <button type="button" onClick={() => void sendTest()} disabled={working} className="mt-3 min-h-12 w-full rounded-xl border-2 border-warm-300 bg-white px-4 font-semibold text-warm-700 disabled:opacity-50">
                  Send me a test notification
                </button>
              )}
              {message && <p className="mt-3 text-sm font-medium text-warm-600" aria-live="polite">{message}</p>}
              {enabled && (
                <label className="mt-4 flex gap-3 rounded-xl bg-cream-100 p-3 text-sm leading-5 text-warm-600">
                  <input type="checkbox" checked={Boolean(state.preferences?.detailed_content)} onChange={event => void setDetailedContent(event.target.checked)} className="mt-1 h-4 w-4" />
                  <span>Show task or appointment details on the lock screen. Leave this off for more privacy.</span>
                </label>
              )}
            </div>

            <div className="mt-6">
              <h3 className="font-semibold text-warm-900">Recent updates</h3>
              <p className="mt-1 text-sm text-warm-400">A short history, without scores or missed-item counts.</p>
              {events.length === 0 ? (
                <div className="mt-3 rounded-2xl bg-cream-100 p-5 text-center text-sm text-warm-500">No recent updates.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {events.map(event => (
                    <article key={event.id} className="rounded-2xl border border-cream-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold uppercase tracking-wide text-sage-600">{categoryLabel(event.category)}</span>
                        <time className="text-xs text-warm-400">{formatNotificationTime(event.sent_at ?? event.created_at)}</time>
                      </div>
                      <h4 className="mt-2 font-semibold text-warm-900">{event.title}</h4>
                      <p className="mt-1 text-sm leading-5 text-warm-500">{event.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
