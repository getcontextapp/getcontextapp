import type { SupabaseClient } from '@supabase/supabase-js'
import { getUtcRangeForLocalDateKey } from '@/lib/dates'
import { buildWeeklySummary, getLastCompletedWeek } from '@/lib/weekly-summary'
import type { ActivityLog, PlannedActivity, Profile } from '@/types'

export async function loadWeeklySummary(
  supabase: SupabaseClient,
  mciProfile: Profile,
  now = new Date(),
) {
  const { startKey, endKey } = getLastCompletedWeek(now, mciProfile.timezone)
  const startRange = getUtcRangeForLocalDateKey(startKey, mciProfile.timezone)
  const endRange = getUtcRangeForLocalDateKey(endKey, mciProfile.timezone)
  const [plannedResult, activityResult] = await Promise.all([
    supabase
      .from('planned_activities')
      .select('*')
      .eq('household_id', mciProfile.household_id)
      .gte('planned_for', startKey)
      .lte('planned_for', endKey)
      .order('planned_for', { ascending: true }),
    supabase
      .from('activity_logs')
      .select('*')
      .eq('household_id', mciProfile.household_id)
      .gte('occurred_at', startRange.start)
      .lt('occurred_at', endRange.end)
      .order('occurred_at', { ascending: false })
      .limit(1000),
  ])

  if (plannedResult.error) {
    throw new Error(`Could not load weekly plans: ${plannedResult.error.message}`)
  }
  if (activityResult.error) {
    throw new Error(`Could not load weekly activity: ${activityResult.error.message}`)
  }

  return buildWeeklySummary(
    (plannedResult.data ?? []) as PlannedActivity[],
    (activityResult.data ?? []) as ActivityLog[],
    mciProfile.timezone,
    startKey,
    endKey,
  )
}
