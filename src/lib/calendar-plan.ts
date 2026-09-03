import { addDaysToKey } from '@/lib/task-scheduling'
import { periodForTime } from '@/lib/task-scheduling'
import { getLocalDateKey } from '@/lib/dates'

export function calendarPlanTiming(startsAt: string, allDay: boolean, timeZone?: string | null) {
  const start = new Date(startsAt)
  const plannedFor = getLocalDateKey(start, timeZone)
  if (allDay) return { plannedFor, expectedTime: null, expectedPeriod: 'anytime' as const }

  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone ?? undefined,
  }).formatToParts(start)
  const hour = parts.find(part => part.type === 'hour')?.value ?? '00'
  const minute = parts.find(part => part.type === 'minute')?.value ?? '00'
  const expectedTime = `${hour === '24' ? '00' : hour}:${minute}`
  return { plannedFor, expectedTime, expectedPeriod: periodForTime(expectedTime) }
}

export function isPlanForDisplayedDate(plannedFor: string, displayedDate: string) {
  return plannedFor === displayedDate
}

export function calendarPlanAddedMessage(plannedFor: string, todayKey: string) {
  if (plannedFor === todayKey) return "Added to today's Context plan."
  if (plannedFor === addDaysToKey(todayKey, 1)) return "Added to tomorrow's Context plan."
  return 'Added to Context for the calendar event date.'
}

export function calendarPlanExistingMessage(plannedFor: string, todayKey: string) {
  if (plannedFor === todayKey) return "This is already in today's Context plan."
  if (plannedFor === addDaysToKey(todayKey, 1)) return "This is already in tomorrow's Context plan."
  return 'This is already in Context for the calendar event date.'
}
