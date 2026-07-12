import type { SupabaseClient } from '@supabase/supabase-js'
import { nextOccurrenceDate, repeatRuleIncludesDate } from '@/lib/task-scheduling'
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

function templateForDate(items: PlannedActivity[], dateKey: string) {
  return [...items]
    .filter(item => item.planned_for <= dateKey)
    .sort((a, b) => b.planned_for.localeCompare(a.planned_for) || b.created_at.localeCompare(a.created_at))[0]
}

export async function ensureRepeatOccurrencesForDate(
  supabase: SupabaseClient,
  householdId: string,
  dateKey: string,
) {
  const { data: repeatItems, error } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', householdId)
    .neq('repeat_rule', 'none')
    .lte('planned_for', dateKey)
    .order('planned_for', { ascending: true })

  if (error) throw error
  if (!repeatItems?.length) return []

  const series = new Map<string, PlannedActivity[]>()
  for (const item of repeatItems as PlannedActivity[]) {
    const seriesId = item.series_id ?? item.id
    const group = series.get(seriesId) ?? []
    group.push(item)
    series.set(seriesId, group)
  }

  const created: PlannedActivity[] = []
  for (const [seriesId, items] of series) {
    const existingForDate = items.find(item => item.planned_for === dateKey)
    if (existingForDate) continue

    const anchor = items[0]
    const template = templateForDate(items, dateKey)
    if (!anchor || !template) continue
    const repeatRule = anchor.repeat_rule as RepeatRule
    if (!repeatRuleIncludesDate(anchor.planned_for, dateKey, repeatRule)) continue

    const { data: inserted, error: insertError } = await supabase
      .from('planned_activities')
      .insert({
        household_id: template.household_id,
        created_by: template.created_by,
        assigned_to: template.assigned_to,
        category: template.category,
        label: template.label,
        note: template.note,
        expected_period: template.expected_period,
        expected_time: template.expected_time,
        planned_for: dateKey,
        repeat_rule: repeatRule,
        series_id: seriesId,
        source: template.source,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') continue
      throw insertError
    }
    if (inserted) created.push(inserted as PlannedActivity)
  }

  return created
}
