'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { addDays, buildUnifiedCalendarItems, monthGrid, startOfWeek } from '@/lib/unified-calendar'
import type { CalendarEvent, PlannedActivity } from '@/types'

type Props = {
  firstName: string
  todayKey: string
  timeZone: string
  events: CalendarEvent[]
  plans: PlannedActivity[]
  linkedPlanIds: string[]
  connected: boolean
}

function readableDate(dateKey: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(`${dateKey}T12:00:00.000Z`).toLocaleDateString('en-US', options ?? {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

export default function CalendarView({ firstName, todayKey, timeZone, events, plans, linkedPlanIds, connected }: Props) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const items = useMemo(
    () => buildUnifiedCalendarItems({ events, plans, linkedPlanIds, timeZone }),
    [events, plans, linkedPlanIds, timeZone],
  )
  const selectedItems = items.filter(item => item.dateKey === selectedDate)
  const weekStart = startOfWeek(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const monthDays = monthGrid(selectedDate)
  const activeMonth = selectedDate.slice(0, 7)

  function movePeriod(direction: -1 | 1) {
    if (view === 'week') setSelectedDate(current => addDays(current, direction * 7))
    else {
      const date = new Date(`${selectedDate}T12:00:00.000Z`)
      date.setUTCMonth(date.getUTCMonth() + direction, 1)
      setSelectedDate(date.toISOString().slice(0, 10))
    }
  }

  return (
    <main className="min-h-svh bg-cream-50 pb-10 safe-bottom">
      <header className="border-b border-cream-200 bg-cream-100 safe-top">
        <div className="mx-auto max-w-lg px-5 py-5">
          <Link href="/mci-user" className="inline-flex min-h-11 items-center text-base font-semibold text-sage-700 focus:outline-none focus:ring-2 focus:ring-sage-300">
            ← Home
          </Link>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">Your schedule</p>
              <h1 className="mt-1 font-serif text-3xl font-semibold text-warm-900">Calendar</h1>
              <p className="mt-1 text-sm text-warm-500">Context and linked calendars, together.</p>
            </div>
            <span className="text-3xl" aria-hidden="true">📅</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-4 px-5 pt-5">
        <div className="grid grid-cols-2 rounded-2xl bg-cream-200 p-1" aria-label="Calendar view">
          {(['week', 'month'] as const).map(option => (
            <button key={option} type="button" onClick={() => setView(option)} aria-pressed={view === option}
              className={`min-h-12 rounded-xl text-base font-semibold capitalize focus:outline-none focus:ring-2 focus:ring-sage-300 ${view === option ? 'bg-white text-warm-900 shadow-card' : 'text-warm-500'}`}>
              {option}
            </button>
          ))}
        </div>

        <section className="rounded-[22px] border-2 border-cream-300 bg-white p-4 shadow-card" aria-label={`${view} calendar`}>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => movePeriod(-1)} aria-label={`Previous ${view}`} className="min-h-11 min-w-11 rounded-xl bg-cream-100 text-xl text-warm-700">‹</button>
            <div className="text-center">
              <p className="font-serif text-xl font-semibold text-warm-900">
                {view === 'week'
                  ? `${readableDate(weekDays[0], { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${readableDate(weekDays[6], { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                  : readableDate(selectedDate, { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </p>
              <button type="button" onClick={() => setSelectedDate(todayKey)} className="mt-1 min-h-9 px-3 text-sm font-semibold text-sage-700 underline underline-offset-4">Today</button>
            </div>
            <button type="button" onClick={() => movePeriod(1)} aria-label={`Next ${view}`} className="min-h-11 min-w-11 rounded-xl bg-cream-100 text-xl text-warm-700">›</button>
          </div>

          {view === 'week' ? (
            <div className="mt-4 grid grid-cols-7 gap-1">
              {weekDays.map(dateKey => {
                const count = items.filter(item => item.dateKey === dateKey).length
                const selected = dateKey === selectedDate
                return (
                  <button key={dateKey} type="button" onClick={() => setSelectedDate(dateKey)} aria-pressed={selected}
                    className={`min-h-[76px] rounded-xl px-1 py-2 text-center focus:outline-none focus:ring-2 focus:ring-sage-300 ${selected ? 'bg-sage-600 text-white' : 'bg-cream-50 text-warm-700'}`}>
                    <span className="block text-[11px] font-bold uppercase">{readableDate(dateKey, { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)}</span>
                    <span className="mt-1 block text-lg font-semibold">{Number(dateKey.slice(-2))}</span>
                    <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${count ? (selected ? 'bg-white' : 'bg-terracotta-500') : 'bg-transparent'}`} />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mt-4">
              <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase text-warm-400">
                {['S','M','T','W','T','F','S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {monthDays.map(dateKey => {
                  const count = items.filter(item => item.dateKey === dateKey).length
                  const selected = dateKey === selectedDate
                  const muted = !dateKey.startsWith(activeMonth)
                  return (
                    <button key={dateKey} type="button" onClick={() => setSelectedDate(dateKey)} aria-label={`${readableDate(dateKey)}${count ? `, ${count} items` : ''}`} aria-pressed={selected}
                      className={`min-h-[52px] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sage-300 ${selected ? 'bg-sage-600 text-white' : muted ? 'text-warm-300' : 'bg-cream-50 text-warm-700'}`}>
                      {Number(dateKey.slice(-2))}
                      {count > 0 && <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : 'bg-terracotta-500'}`} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[22px] border-2 border-cream-300 bg-white p-5 shadow-card" aria-labelledby="selected-day-title">
          <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">Selected day</p>
          <h2 id="selected-day-title" className="mt-1 font-serif text-2xl font-semibold text-warm-900">{readableDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</h2>
          {selectedItems.length === 0 ? (
            <p className="mt-4 rounded-xl bg-cream-100 px-4 py-4 text-base text-warm-500">Nothing scheduled for this day.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {selectedItems.map(item => (
                <article key={item.id} className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-warm-900">{item.title}</p>
                      <p className="mt-1 text-sm text-warm-500">{item.location || (item.source === 'google' ? 'Linked calendar' : 'Context')}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-warm-600">{item.timeLabel}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.source === 'google' ? 'bg-blue-50 text-blue-700' : 'bg-sage-100 text-sage-700'}`}>
                      {item.source === 'google' ? 'Google Calendar' : 'Context'}
                    </span>
                    {item.status === 'confirmed' && <span className="rounded-full bg-sage-100 px-3 py-1 text-xs font-semibold text-sage-700">Done</span>}
                    {item.status === 'not_now' && <span className="rounded-full bg-cream-200 px-3 py-1 text-xs font-semibold text-warm-600">Later</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {!connected && (
          <div className="rounded-[20px] border-2 border-cream-300 bg-white p-5 text-center shadow-card">
            <p className="text-base font-semibold text-warm-900">Want to see another calendar here?</p>
            <p className="mt-2 text-sm text-warm-500">Connect Google Calendar from the Calendar section on your home screen.</p>
          </div>
        )}
        <p className="px-2 text-center text-sm leading-5 text-warm-400">Hi {firstName}, linked calendar events are view-only. Context will never silently change them.</p>
      </div>
    </main>
  )
}
