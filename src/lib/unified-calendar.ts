import type { CalendarEvent, PlannedActivity } from '@/types'

export type UnifiedCalendarItem = {
  id: string
  source: 'context' | 'google'
  title: string
  dateKey: string
  sortTime: string
  timeLabel: string
  location: string | null
  status: PlannedActivity['status'] | 'calendar'
  allDay: boolean
}

function localDateKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  }).format(new Date(value))
}

function eventTimeLabel(event: CalendarEvent, timeZone: string) {
  if (event.all_day) return 'All day'
  return new Date(event.starts_at).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
  })
}

function taskTimeLabel(task: PlannedActivity) {
  if (!task.expected_time) {
    return task.expected_period === 'anytime'
      ? 'Anytime'
      : `${task.expected_period.charAt(0).toUpperCase()}${task.expected_period.slice(1)}`
  }
  const [hour, minute] = task.expected_time.split(':').map(Number)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute || 0).padStart(2, '0')} ${suffix}`
}

function normalizedTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function buildUnifiedCalendarItems({
  events,
  plans,
  linkedPlanIds,
  timeZone,
}: {
  events: CalendarEvent[]
  plans: PlannedActivity[]
  linkedPlanIds: string[]
  timeZone: string
}) {
  const linked = new Set(linkedPlanIds)
  const eventItems: UnifiedCalendarItem[] = events.map(event => ({
    id: `google:${event.id}`,
    source: 'google',
    title: event.title,
    dateKey: localDateKey(event.starts_at, timeZone),
    sortTime: event.all_day ? '23:59' : new Date(event.starts_at).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
    }),
    timeLabel: eventTimeLabel(event, timeZone),
    location: event.location,
    status: 'calendar',
    allDay: event.all_day,
  }))

  const eventKeys = new Set(eventItems.map(item => `${item.dateKey}|${item.sortTime}|${normalizedTitle(item.title)}`))
  const planItems: UnifiedCalendarItem[] = plans
    .filter(plan => !linked.has(plan.id))
    .filter(plan => !eventKeys.has(`${plan.planned_for}|${plan.expected_time?.slice(0, 5) ?? '23:59'}|${normalizedTitle(plan.note?.trim() || plan.label)}`))
    .map(plan => ({
      id: `context:${plan.id}`,
      source: 'context',
      title: plan.note?.trim() || plan.label,
      dateKey: plan.planned_for,
      sortTime: plan.expected_time?.slice(0, 5) ?? '23:58',
      timeLabel: taskTimeLabel(plan),
      location: null,
      status: plan.status,
      allDay: !plan.expected_time,
    }))

  return [...eventItems, ...planItems].sort((left, right) =>
    left.dateKey.localeCompare(right.dateKey) || left.sortTime.localeCompare(right.sortTime) || left.title.localeCompare(right.title),
  )
}

export function addDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function startOfWeek(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  return addDays(dateKey, -date.getUTCDay())
}

export function monthGrid(dateKey: string) {
  const monthStart = `${dateKey.slice(0, 7)}-01`
  const start = startOfWeek(monthStart)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}
