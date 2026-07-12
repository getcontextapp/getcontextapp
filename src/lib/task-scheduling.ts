import type { ExpectedPeriod, RepeatRule } from '@/types'

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Every week',
}

export function formatTaskTiming(expectedTime: string | null, expectedPeriod: ExpectedPeriod) {
  if (!expectedTime) {
    return {
      morning: 'Morning',
      afternoon: 'Afternoon',
      evening: 'Evening',
      anytime: 'Anytime',
    }[expectedPeriod]
  }
  const [hours, minutes] = expectedTime.split(':').map(Number)
  const date = new Date(2000, 0, 1, hours, minutes)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function periodForTime(expectedTime: string): ExpectedPeriod {
  const hour = Number(expectedTime.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function addDaysToKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function nextOccurrenceDate(dateKey: string, repeatRule: RepeatRule) {
  if (repeatRule === 'weekly') return addDaysToKey(dateKey, 7)
  let next = addDaysToKey(dateKey, 1)
  if (repeatRule === 'weekdays') {
    const day = new Date(`${next}T12:00:00Z`).getUTCDay()
    if (day === 6) next = addDaysToKey(next, 2)
    if (day === 0) next = addDaysToKey(next, 1)
  }
  return next
}

function daysBetween(startKey: string, endKey: string) {
  const start = new Date(`${startKey}T12:00:00Z`).getTime()
  const end = new Date(`${endKey}T12:00:00Z`).getTime()
  return Math.round((end - start) / 86_400_000)
}

export function repeatRuleIncludesDate(anchorDateKey: string, targetDateKey: string, repeatRule: RepeatRule) {
  if (repeatRule === 'none') return anchorDateKey === targetDateKey

  const diff = daysBetween(anchorDateKey, targetDateKey)
  if (diff < 0) return false
  if (repeatRule === 'daily') return true
  if (repeatRule === 'weekly') return diff % 7 === 0

  const day = new Date(`${targetDateKey}T12:00:00Z`).getUTCDay()
  return day >= 1 && day <= 5
}
