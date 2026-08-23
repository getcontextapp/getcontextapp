'use client'

import { useMemo, useState } from 'react'
import type { CalendarConnectionSummary, CalendarEvent, PlannedActivity } from '@/types'
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
  onPlannedActivityAdded?: (activity: PlannedActivity) => void
}

type CalendarDisplayEvent = CalendarEvent & { displayContext: 'upcoming' | 'earlier' | 'tomorrow' }

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

function localDateKey(date: Date, timeZone?: string | null) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timeZone ?? undefined,
  }).format(date)
}

function nextDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function eventEndTime(event: CalendarEvent) {
  if (event.ends_at) return Date.parse(event.ends_at)
  const start = Date.parse(event.starts_at)
  return event.all_day ? start + 24 * 60 * 60 * 1000 : start + 60 * 60 * 1000
}

function displayCalendarEvents(events: CalendarEvent[], timeZone?: string | null): CalendarDisplayEvent[] {
  const now = Date.now()
  const todayKey = localDateKey(new Date(now), timeZone)
  const tomorrowKey = nextDateKey(todayKey)
  const visible = events
    .filter(event => !event.hidden_at)
    .slice()
    .sort((left, right) => {
      if (left.all_day !== right.all_day) return left.all_day ? 1 : -1
      return Date.parse(left.starts_at) - Date.parse(right.starts_at)
    })

  const timedUpcomingToday = visible
    .filter(event => localDateKey(new Date(event.starts_at), timeZone) === todayKey && eventEndTime(event) >= now)
    .filter(event => !event.all_day)
    .slice(0, 2)
    .map(event => ({ ...event, displayContext: 'upcoming' as const }))

  if (timedUpcomingToday.length > 0) return timedUpcomingToday

  const allDayToday = visible
    .filter(event => localDateKey(new Date(event.starts_at), timeZone) === todayKey && event.all_day && eventEndTime(event) >= now)
    .slice(0, 2)
    .map(event => ({ ...event, displayContext: 'upcoming' as const }))

  if (allDayToday.length > 0) return allDayToday

  const tomorrow = visible
    .filter(event => localDateKey(new Date(event.starts_at), timeZone) === tomorrowKey)
    .slice(0, 2)
    .map(event => ({ ...event, displayContext: 'tomorrow' as const }))

  if (tomorrow.length > 0) return tomorrow

  return visible
    .filter(event => localDateKey(new Date(event.starts_at), timeZone) === todayKey && eventEndTime(event) < now)
    .slice(-1)
    .map(event => ({ ...event, displayContext: 'earlier' as const }))
}

function sectionIntro(displayEvents: CalendarDisplayEvent[], role: CalendarCardProps['role']) {
  if (displayEvents.length === 0) return 'No calendar events today or tomorrow.'
  if (displayEvents[0].displayContext === 'tomorrow') return 'No more calendar events today. Here is what is next tomorrow.'
  if (displayEvents[0].displayContext === 'earlier') return 'The last calendar item I see from today.'
  return displayEvents.length === 1 ? '1 thing from the calendar is coming up.' : `${displayEvents.length} things from the calendar are coming up.`
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
  onPlannedActivityAdded,
}: CalendarCardProps) {
  const [busy, setBusy] = useState(false)
  const [eventBusy, setEventBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const displayEvents = useMemo(() => displayCalendarEvents(events, timeZone), [events, timeZone])

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
    setMessage(null)
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
    setMessage('Calendar refreshed.')
  }

  async function hideCalendarEvent(event: CalendarEvent) {
    setEventBusy(`hide:${event.id}`)
    setError(null)
    setMessage(null)
    const response = await fetch('/api/calendar/hide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_profile_id: ownerProfileId, event_id: event.id }),
    })
    const result = await response.json().catch(() => ({})) as CalendarDashboardData & { error?: string }
    setEventBusy(null)
    if (!response.ok) {
      setError(result.error || 'Could not hide this calendar event.')
      return
    }
    onCalendarUpdated?.(result)
    setMessage('Hidden from this calendar card.')
  }

  async function addCalendarEventToContext(event: CalendarEvent) {
    setEventBusy(`add:${event.id}`)
    setError(null)
    setMessage(null)
    const response = await fetch('/api/calendar/add-to-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_profile_id: ownerProfileId, event_id: event.id }),
    })
    const result = await response.json().catch(() => ({})) as {
      calendar?: CalendarDashboardData
      plannedActivity?: PlannedActivity
      error?: string
    }
    setEventBusy(null)
    if (!response.ok || !result.calendar) {
      setError(result.error || 'Could not add this to Context.')
      return
    }
    onCalendarUpdated?.(result.calendar)
    if (result.plannedActivity) onPlannedActivityAdded?.(result.plannedActivity)
    setMessage('Added to Context.')
  }

  async function disconnectCalendar() {
    setBusy(true)
    setError(null)
    setMessage(null)
    const response = await fetch('/api/calendar/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_profile_id: ownerProfileId }),
    })
    const result = await response.json().catch(() => ({})) as CalendarDashboardData & { error?: string }
    setBusy(false)
    if (!response.ok) {
      setError(result.error || 'Could not disconnect calendar.')
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
          <p className="mt-2 text-sm leading-5 text-warm-500">
            {sectionIntro(displayEvents, role)}
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
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => addCalendarEventToContext(event)}
                  disabled={Boolean(eventBusy)}
                  className="min-h-[52px] rounded-xl bg-sage-600 px-3 text-sm font-semibold text-white disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-sage-300/60"
                >
                  {eventBusy === `add:${event.id}` ? 'Adding' : 'Add to Context'}
                </button>
                <button
                  type="button"
                  onClick={() => hideCalendarEvent(event)}
                  disabled={Boolean(eventBusy)}
                  className="min-h-[52px] rounded-xl border border-cream-300 bg-white px-3 text-sm font-semibold text-warm-600 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-sage-300/50"
                >
                  {eventBusy === `hide:${event.id}` ? 'Hiding' : 'Hide'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setSettingsOpen(current => !current)}
        className="mt-4 min-h-[52px] w-full rounded-xl border border-cream-300 bg-white px-3 text-sm font-semibold text-warm-600 focus:outline-none focus:ring-4 focus:ring-sage-300/50"
      >
        Calendar settings
      </button>
      {settingsOpen && (
        <div className="mt-2 rounded-xl bg-cream-100 p-2">
          <button
            type="button"
            onClick={connectGoogleCalendar}
            disabled={busy}
            className="min-h-[52px] w-full rounded-lg bg-white text-sm font-medium text-warm-700 disabled:opacity-60"
          >
            Change Google calendar
          </button>
          <button
            type="button"
            onClick={disconnectCalendar}
            disabled={busy}
            className="mt-2 min-h-[52px] w-full rounded-lg bg-white text-sm font-medium text-terracotta-700 disabled:opacity-60"
          >
            Disconnect calendar
          </button>
        </div>
      )}
      {message && <p className="mt-3 rounded-xl bg-sage-50 px-4 py-3 text-sm font-medium text-sage-700">{message}</p>}
      {error && <p className="mt-3 rounded-xl bg-cream-100 px-4 py-3 text-sm font-medium text-warm-600">{error}</p>}
    </section>
  )
}
