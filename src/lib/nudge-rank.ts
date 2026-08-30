import type { SupabaseClient } from '@supabase/supabase-js'

export type CalendarNudgeDecision =
  | 'send'
  | 'send_distinct_cognitive_value'
  | 'suppress_source_calendar_duplicate'

export function nudgeRankCalendarDecision(input: {
  calendarLinked: boolean
  distinctCognitiveValue: boolean
}): CalendarNudgeDecision {
  if (!input.calendarLinked) return 'send'
  if (input.distinctCognitiveValue) return 'send_distinct_cognitive_value'
  return 'suppress_source_calendar_duplicate'
}

export async function loadCalendarLinkedPlanIds(
  supabase: SupabaseClient,
  householdId: string,
) {
  const { data, error } = await supabase
    .from('analytics_events')
    .select('properties')
    .eq('household_id', householdId)
    .eq('event_name', 'calendar_event_added_to_context')

  if (error) throw new Error(error.message)

  return new Set((data ?? []).flatMap(event => {
    const planId = event.properties?.planned_activity_id
    return typeof planId === 'string' && planId ? [planId] : []
  }))
}
