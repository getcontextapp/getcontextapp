import type { SupabaseClient } from '@supabase/supabase-js'
import { nextOccurrenceDate } from '@/lib/task-scheduling'
import type { PlannedActivity, RepeatRule } from '@/types'

export async function ensureNextOccurrence(
  supabase: SupabaseClient,
  activity: PlannedActivity,
) {
  const repeatRule = activity.repeat_rule as RepeatRule
  if (!repeatRule || repeatRule === 'none') return null

  const seriesId = activity.series_id ?? activity.id
  const plannedFor = nextOccurrenceDate(activity.planned_for, repeatRule)
  const { data: existing, error: lookupError } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('series_id', seriesId)
    .eq('planned_for', plannedFor)
    .maybeSingle()
  if (lookupError) throw lookupError
  if (existing) return existing as PlannedActivity

  const { data: created, error } = await supabase
    .from('planned_activities')
    .insert({
      household_id: activity.household_id,
      created_by: activity.created_by,
      assigned_to: activity.assigned_to,
      category: activity.category,
      label: activity.label,
      note: activity.note,
      expected_period: activity.expected_period,
      expected_time: activity.expected_time,
      planned_for: plannedFor,
      repeat_rule: repeatRule,
      series_id: seriesId,
      source: activity.source,
    })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return null
    throw error
  }
  return created as PlannedActivity
}
