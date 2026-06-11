import { getLocalDateKey } from '@/lib/dates'
import { suppressNearbyDuplicateActivities } from '@/lib/activity-display'
import type { ActivityCategory, ActivityLog, PlannedActivity } from '@/types'

export type WeeklySummaryRole = 'mci_user' | 'care_partner'

export interface WeeklySummaryCategory {
  category: ActivityCategory
  count: number
}

export interface WeeklySummaryPeriod {
  period: 'Morning' | 'Afternoon' | 'Evening'
  count: number
  percent: number
}

export interface WeeklySummaryData {
  startKey: string
  endKey: string
  dateLabel: string
  completed: number
  notCompleted: number
  skipped: number
  totalPlanned: number
  completionRate: number
  mostActiveDay: string | null
  mostActiveDayCount: number
  daysWithActivity: number
  activityCount: number
  periods: WeeklySummaryPeriod[]
  categories: WeeklySummaryCategory[]
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function dayOfWeek(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay()
}

export function getLastCompletedWeek(now: Date, timeZone?: string | null) {
  const todayKey = getLocalDateKey(now, timeZone)
  const todayDay = dayOfWeek(todayKey)
  const endKey = addDays(todayKey, todayDay === 0 ? -1 : -(todayDay + 1))
  return {
    startKey: addDays(endKey, -6),
    endKey,
  }
}

export function formatWeeklyDateRange(startKey: string, endKey: string) {
  const start = new Date(`${startKey}T12:00:00Z`)
  const end = new Date(`${endKey}T12:00:00Z`)
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth()
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  })
  const endLabel = end.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${startLabel} to ${endLabel}`
}

export function buildWeeklySummary(
  plannedActivities: PlannedActivity[],
  activities: ActivityLog[],
  timeZone: string | null | undefined,
  startKey: string,
  endKey: string,
): WeeklySummaryData {
  const weeklyPlans = plannedActivities.filter(
    item => item.planned_for >= startKey && item.planned_for <= endKey,
  )
  const completed = weeklyPlans.filter(item => item.status === 'confirmed').length
  const skipped = weeklyPlans.filter(item => item.status === 'skipped').length
  const notCompleted = weeklyPlans.length - completed - skipped
  const activityIds = new Set(activities.map(activity => activity.id))
  const orphanConfirmedActivities: ActivityLog[] = weeklyPlans
    .filter(item => item.status === 'confirmed')
    .filter(item => !item.confirmed_activity_log_id || !activityIds.has(item.confirmed_activity_log_id))
    .map(item => ({
      id: `plan-${item.id}`,
      household_id: item.household_id,
      logged_by: item.assigned_to ?? item.created_by,
      category: item.category,
      label: item.label,
      note: item.note,
      occurred_at: item.confirmed_at ?? item.updated_at ?? item.created_at,
      created_at: item.updated_at ?? item.created_at,
    }))
  const displayActivities = suppressNearbyDuplicateActivities(
    [...activities, ...orphanConfirmedActivities],
    weeklyPlans,
  )
  const activityDays = new Map<string, number>()
  const periodCounts = { Morning: 0, Afternoon: 0, Evening: 0 }
  const categoryCounts = new Map<ActivityCategory, number>()

  for (const activity of displayActivities) {
    const dayKey = getLocalDateKey(new Date(activity.occurred_at), timeZone)
    activityDays.set(dayKey, (activityDays.get(dayKey) ?? 0) + 1)
    const hour = Number(new Date(activity.occurred_at).toLocaleString('en-US', {
      timeZone: timeZone || undefined,
      hour: 'numeric',
      hour12: false,
    }))
    const period = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
    periodCounts[period]++
    categoryCounts.set(activity.category, (categoryCounts.get(activity.category) ?? 0) + 1)
  }

  const mostActive = [...activityDays.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return b[0].localeCompare(a[0])
  })[0]
  const activityCount = displayActivities.length
  const periods = (Object.entries(periodCounts) as Array<[WeeklySummaryPeriod['period'], number]>)
    .map(([period, count]) => ({
      period,
      count,
      percent: activityCount > 0 ? Math.round((count / activityCount) * 100) : 0,
    }))
  const categories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))

  return {
    startKey,
    endKey,
    dateLabel: formatWeeklyDateRange(startKey, endKey),
    completed,
    notCompleted,
    skipped,
    totalPlanned: weeklyPlans.length,
    completionRate: weeklyPlans.length > 0 ? Math.round((completed / weeklyPlans.length) * 100) : 0,
    mostActiveDay: mostActive
      ? new Date(`${mostActive[0]}T12:00:00Z`).toLocaleDateString('en-US', {
          weekday: 'long',
          timeZone: 'UTC',
        })
      : null,
    mostActiveDayCount: mostActive?.[1] ?? 0,
    daysWithActivity: activityDays.size,
    activityCount,
    periods,
    categories,
  }
}

export function getWeeklyEncouragement(summary: WeeklySummaryData, role: WeeklySummaryRole) {
  if (summary.totalPlanned === 0 && summary.activityCount === 0) {
    return role === 'care_partner'
      ? 'No activity was recorded for this week. The summary will fill in as Context is used.'
      : 'No activity was recorded this week. A new week is a fresh place to begin.'
  }

  const lead = summary.completionRate >= 75
    ? role === 'care_partner'
      ? 'Most planned activities were completed this week.'
      : 'You completed most of what you planned this week.'
    : summary.completed > 0
      ? role === 'care_partner'
        ? `${summary.completed} planned ${summary.completed === 1 ? 'activity was' : 'activities were'} completed this week.`
        : `You completed ${summary.completed} planned ${summary.completed === 1 ? 'activity' : 'activities'} this week.`
      : role === 'care_partner'
        ? 'This was a quieter week for completed plans.'
        : 'This was a quieter week. Small steps still count.'

  const strongestPeriod = [...summary.periods].sort((a, b) => b.count - a.count)[0]
  if (!strongestPeriod || strongestPeriod.count === 0) return lead
  return `${lead} Most recorded activity happened in the ${strongestPeriod.period.toLowerCase()}.`
}
