import type { ActivityLog, PlannedActivity } from '@/types'

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000

function normalizedActivityName(activity: ActivityLog) {
  return `${activity.category}:${activity.note?.trim() || activity.label}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function suppressNearbyDuplicateActivities(
  activities: ActivityLog[],
  plannedActivities: PlannedActivity[],
) {
  const linkedActivityIds = new Set(
    plannedActivities
      .map(item => item.confirmed_activity_log_id)
      .filter((id): id is string => Boolean(id)),
  )
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  )

  return sortedActivities.filter((activity, index, all) => {
    const nearbyDuplicates = all
      .map((other, otherIndex) => ({ other, otherIndex }))
      .filter(({ other, otherIndex }) => {
        if (otherIndex === index || normalizedActivityName(other) !== normalizedActivityName(activity)) {
          return false
        }
        return Math.abs(
          new Date(other.occurred_at).getTime() - new Date(activity.occurred_at).getTime(),
        ) <= DUPLICATE_WINDOW_MS
      })

    if (linkedActivityIds.has(activity.id)) {
      return !nearbyDuplicates.some(({ other, otherIndex }) =>
        otherIndex < index && linkedActivityIds.has(other.id),
      )
    }

    return !nearbyDuplicates.some(({ other, otherIndex }) =>
      linkedActivityIds.has(other.id) || otherIndex < index,
    )
  })
}
