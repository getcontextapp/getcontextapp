'use client'

import { useMemo, useState } from 'react'
import type { CalendarConnectionSummary, CalendarEvent } from '@/types'
import type { CalendarDashboardData } from '@/lib/calendar-sync'

type CalendarCardProps = {
  role: 'mci_user' | 'care_partner'
  ownerProfileId: string
  ownerName: string
  enabled: boolean
  connection: CalendarConnectionSummary | null
  events: CalendarEvent[]
  timeZone?: string | null
  onCalendarUpdated?: (data: CalendarDashboardData) => void
}

function formatEventTime(event: CalendarEvent, timeZone?: string | null) {
  if (event.all_day) return 'All day'
  return new Date(event.starts_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timeZone ?? undefined,
  })
}

function formatEventDay(event: CalendarEvent, timeZone?: string | null) {
  return new Date(event.starts_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timeZone ?? undefined,
  })
}

export default function CalendarCard({
  role,
  ownerProfileId,
  ownerName,
  enabled,
  connection,
  events,
  timeZone,
  onCalendarUpdated,
}: CalendarCardProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const displayEvents = useMemo(() => events.slice(0, 4), [events])

  if (!enabled) return null

  async function connectGoogleCalendar() {
    setBusy(true)
    setError(null)
    const response = await fetch('/api/calendar/google/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_profile_id: ownerProfileId }),
    })
    const result = await response.json().catch(() => ({})) as { url?: string; error?: string }
    if (!response.ok || !result.url) {
      setBusy(false)
      setError(result.error || 'Could not start calendar setup.')
      return
    }
    window.location.href = result.url
  }

  async function syncCalendar() {
    setBusy(true)
    setError(null)
    const response = await fetch('/api/calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_profile_id: ownerProfileId }),
    })
    const result = await response.json().catch(() => ({})) as CalendarDashboardData & { error?: string }
    setBusy(false)
    if (!response.ok) {
      setError(result.error || 'Could not refresh calendar.')
      return
    }
    onCalendarUpdated?.(result)
  }

  if (!connection) {
    return (
      <section className="rounded-[20px] border-2 border-cream-300 bg-white p-5 shadow-card" aria-label="Calendar setup">
        <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">Calendar</p>
        <h2 className="mt-2 font-serif text-xl font-semibold leading-7 text-warm-900">
          {role === 'care_partner' ? 'Connect their calendar' : 'Connect my calendar'}
        </h2>
        <p className="mt-2 text-base leading-6 text-warm-500">
          Context can see calendar events. Context cannot edit your calendar.
        </p>
        <button
          type="button"
          onClick={connectGoogleCalendar}
          disabled={busy}
          className="mt-4 min-h-[56px] w-full rounded-[16px] bg-warm-700 px-5 text-base font-semibold text-cream-50 shadow-card active:scale-[0.99] transition-all disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-sage-300/60"
        >
          {busy ? 'Opening Google...' : 'Choose Google'}
        </button>
        {error && <p className="mt-3 rounded-xl bg-cream-100 px-4 py-3 text-sm font-medium text-warm-600">{error}</p>}
      </section>
    )
  }

  return (
    <section className="rounded-[20px] border-2 border-cream-300 bg-white p-5 shadow-card" aria-label="Calendar events">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">Calendar</p>
          <h2 className="mt-2 font-serif text-xl font-semibold leading-7 text-warm-900">
            {role === 'care_partner' ? `${ownerName}'s calendar` : "Today's calendar"}
          </h2>
          <p className="mt-1 text-sm leading-5 text-warm-400">
            Google connected. Read only.
          </p>
        </div>
        <button
          type="button"
          onClick={syncCalendar}
          disabled={busy}
          className="min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3 text-sm font-semibold text-warm-600 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-sage-300/50"
        >
          {busy ? 'Syncing' : 'Refresh'}
        </button>
      </div>
      {displayEvents.length === 0 ? (
        <p className="mt-4 rounded-xl bg-cream-100 px-4 py-3 text-base leading-6 text-warm-500">
          No calendar events today or tomorrow.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {displayEvents.map(event => (
            <div key={event.id} className="rounded-2xl bg-cream-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-base font-semibold leading-6 text-warm-900 break-words">{event.title}</p>
                <p className="shrink-0 text-sm font-semibold text-warm-500">{formatEventTime(event, timeZone)}</p>
              </div>
              <p className="mt-1 text-sm text-warm-400">
                {formatEventDay(event, timeZone)}
                {event.location ? ` · ${event.location}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-3 rounded-xl bg-cream-100 px-4 py-3 text-sm font-medium text-warm-600">{error}</p>}
    </section>
  )
}
