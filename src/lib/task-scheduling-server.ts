import type { SupabaseClient } from '@supabase/supabase-js'
import { nextOccurrenceDate, repeatRuleIncludesDate } from '@/lib/task-scheduling'
import type { PlannedActivity, RepeatRule } from '@/types'

const DUPLICATE_CLEANUP_STATUSES = ['planned', 'not_now'] as const

export function normalizedRepeatTaskText(activity: Pick<PlannedActivity, 'note' | 'label'>) {
  return String(activity.note || activity.label || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(?:please|remind me to|i need to|i want to|i plan to|i will)\b/g, ' ')
    .replace(/\b(?:go to the|go to|finish|complete|do|work on|start|continue|respond to)\b/g, ' ')
    .replace(/\b(the|a|an|my|today|tomorrow)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function repeatTaskKey(activity: Pick<PlannedActivity, 'assigned_to' | 'created_by' | 'note' | 'label' | 'repeat_rule'>) {
  return [
    activity.assigned_to ?? activity.created_by,
    activity.repeat_rule,
    normalizedRepeatTaskText(activity),
  ].join('|')
}

function chooseCanonicalOccurrence(items: PlannedActivity[]) {
  return [...items].sort((a, b) => {
    const statusScore = (item: PlannedActivity) => item.status === 'confirmed' ? 0 : item.status === 'planned' ? 1 : 2
    const timeScore = (item: PlannedActivity) => item.expected_time ? 0 : item.expected_period !== 'anytime' ? 1 : 2
    return statusScore(a) - statusScore(b)
      || timeScore(a) - timeScore(b)
      || b.updated_at.localeCompare(a.updated_at)
      || a.created_at.localeCompare(b.created_at)
  })[0]
}

export async function dedupeRepeatOccurrencesForDate(
  supabase: SupabaseClient,
  householdId: string,
  dateKey: string,
) {
  const { data: rows, error } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', householdId)
    .eq('planned_for', dateKey)
    .neq('repeat_rule', 'none')
    .in('status', ['planned', 'not_now', 'confirmed'])

  if (error) throw error
  if (!rows?.length) return []

  const groups = new Map<string, PlannedActivity[]>()
  for (const row of rows as PlannedActivity[]) {
    const key = repeatTaskKey(row)
    if (!key.endsWith('|')) {
      const group = groups.get(key) ?? []
      group.push(row)
      groups.set(key, group)
    }
  }

  const skippedIds: string[] = []
  for (const items of groups.values()) {
    if (items.length < 2) continue
    const keeper = chooseCanonicalOccurrence(items)
    const duplicateIds = items
      .filter(item => item.id !== keeper?.id && DUPLICATE_CLEANUP_STATUSES.includes(item.status as typeof DUPLICATE_CLEANUP_STATUSES[number]))
      .map(item => item.id)
    if (duplicateIds.length === 0) continue
    const { error: updateError } = await supabase
      .from('planned_activities')
      .update({ status: 'skipped', updated_at: new Date().toISOString() })
      .eq('household_id', householdId)
      .in('id', duplicateIds)
    if (updateError) throw updateError
    skippedIds.push(...duplicateIds)
  }

  return skippedIds
}

export async function findMatchingRepeatOccurrence(
  supabase: SupabaseClient,
  activity: PlannedActivity,
  plannedFor: string,
  includeSkipped = false,
) {
  let query = supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', activity.household_id)
    .eq('planned_for', plannedFor)
    .eq('repeat_rule', activity.repeat_rule)
    .neq('status', 'abandoned')
  if (!includeSkipped) query = query.neq('status', 'skipped')

  const { data: rows, error } = await query

  if (error) throw error
  const key = repeatTaskKey(activity)
  return ((rows ?? []) as PlannedActivity[]).find(row => repeatTaskKey(row) === key) ?? null
}

export async function findMatchingRepeatFamily(
  supabase: SupabaseClient,
  activity: PlannedActivity,
  fromDateKey = activity.planned_for,
) {
  if (!activity.repeat_rule || activity.repeat_rule === 'none') return [activity]

  const { data: rows, error } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', activity.household_id)
    .eq('repeat_rule', activity.repeat_rule)
    .gte('planned_for', fromDateKey)

  if (error) throw error
  const key = repeatTaskKey(activity)
  return ((rows ?? []) as PlannedActivity[]).filter(row => repeatTaskKey(row) === key)
}

export async function ensureNextOccurrence(
  supabase: SupabaseClient,
  activity: PlannedActivity,
) {
  const repeatRule = activity.repeat_rule as RepeatRule
  if (!repeatRule || repeatRule === 'none') return null

  const seriesId = activity.series_id ?? activity.id
  const plannedFor = nextOccurrenceDate(activity.planned_for, repeatRule)
  const matching = await findMatchingRepeatOccurrence(supabase, activity, plannedFor, true)
  if (matching) return matching

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

  await dedupeRepeatOccurrencesForDate(supabase, householdId, dateKey)

  const series = new Map<string, PlannedActivity[]>()
  for (const item of repeatItems as PlannedActivity[]) {
    const seriesId = repeatTaskKey(item)
    const group = series.get(seriesId) ?? []
    group.push(item)
    series.set(seriesId, group)
  }

  const created: PlannedActivity[] = []
  for (const [, items] of series) {
    const existingForDate = items.find(item => item.planned_for === dateKey)
    if (existingForDate) continue

    const anchor = items[0]
    const template = templateForDate(items, dateKey)
    if (!anchor || !template) continue
    const repeatRule = anchor.repeat_rule as RepeatRule
    if (!repeatRuleIncludesDate(anchor.planned_for, dateKey, repeatRule)) continue
    const canonicalSeriesId = anchor.series_id ?? anchor.id

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
        series_id: canonicalSeriesId,
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
