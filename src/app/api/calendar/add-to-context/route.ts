import { NextRequest, NextResponse } from 'next/server'
import { trackEvent } from '@/lib/analytics'
import { getLocalDateKey } from '@/lib/dates'
import { calendarPlanExistingMessage, calendarPlanTiming } from '@/lib/calendar-plan'
import { getCalendarDashboardData, resolveCalendarOwnerProfile } from '@/lib/calendar-sync'
import { createServerClient } from '@/lib/supabase-server'
import { isLikelyDuplicate, type DuplicateCandidate } from '@/lib/duplicate-detection'
import { latestFeatureRolloutEnabled } from '@/lib/feature-rollout'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id) {
    return NextResponse.json({ error: 'Household setup is needed first.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { owner_profile_id?: string; event_id?: string; confirm_duplicates?: boolean }
  const ownerProfile = await resolveCalendarOwnerProfile(supabase, profile, body.owner_profile_id, true)
  if (!ownerProfile?.household_id || ownerProfile.household_id !== profile.household_id) {
    return NextResponse.json({ error: 'Calendar management is not enabled for this care partner.' }, { status: 403 })
  }
  if (!body.event_id) return NextResponse.json({ error: 'Choose a calendar event.' }, { status: 400 })

  const { data: event, error: eventError } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', body.event_id)
    .eq('owner_profile_id', ownerProfile.id)
    .eq('household_id', ownerProfile.household_id)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (eventError || !event || event.hidden_at) {
    return NextResponse.json({ error: eventError?.message ?? 'Calendar event was not found.' }, { status: 404 })
  }

  const { expectedTime, expectedPeriod, plannedFor } = calendarPlanTiming(
    event.starts_at,
    event.all_day,
    ownerProfile.timezone,
  )

  const { data: existingPlans } = await supabase
    .from('planned_activities')
    .select('id,note,label,planned_for,expected_time')
    .eq('household_id', ownerProfile.household_id)
    .eq('planned_for', plannedFor)
    .in('status', ['planned', 'not_now', 'confirmed'])
    .limit(50)

  const { data: household } = await supabase.from('households').select('name,created_at').eq('id', ownerProfile.household_id).maybeSingle()
  const householdName = household?.name ?? ''
  const onboardingAt = household?.created_at && ownerProfile.created_at
    ? new Date(Math.min(new Date(household.created_at).getTime(), new Date(ownerProfile.created_at).getTime())).toISOString()
    : household?.created_at ?? ownerProfile.created_at
  const duplicateCheckEnabled = latestFeatureRolloutEnabled(householdName, onboardingAt)
  const candidate: DuplicateCandidate = {
    id: event.id,
    title: event.title,
    source: 'Google Calendar',
    planned_for: plannedFor,
    expected_time: expectedTime,
  }
  const taskDuplicate = (existingPlans ?? []).find(plan => isLikelyDuplicate({ title: plan.note || plan.label, planned_for: plan.planned_for, expected_time: plan.expected_time }, candidate))
  if (duplicateCheckEnabled && !body.confirm_duplicates && taskDuplicate) {
    const todayKey = getLocalDateKey(new Date(), ownerProfile.timezone)
    return NextResponse.json({
      duplicate_warning: true,
      duplicates: [{ input_title: event.title, id: taskDuplicate.id, title: taskDuplicate.note || taskDuplicate.label, source: 'Context', planned_for: plannedFor, expected_time: expectedTime }],
      error: calendarPlanExistingMessage(plannedFor, todayKey),
    }, { status: 409 })
  }

  const { data: plannedActivity, error: insertError } = await supabase
    .from('planned_activities')
    .insert({
      household_id: ownerProfile.household_id,
      created_by: profile.id,
      assigned_to: ownerProfile.id,
      category: 'custom',
      label: event.title,
      note: null,
      expected_period: expectedPeriod,
      expected_time: expectedTime,
      planned_for: plannedFor,
      repeat_rule: 'none',
      source: 'manual',
      external_event_id: event.id,
      provider: event.provider,
      link_decision: 'linked',
      reminder_owner: 'external',
    })
    .select('*')
    .single()

  if (insertError || !plannedActivity) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not add this to Context.' }, { status: 500 })
  }

  await trackEvent(supabase, {
    eventName: 'calendar_event_added_to_context',
    profile,
    userId: user.id,
    properties: {
      owner_profile_id: ownerProfile.id,
      calendar_event_id: event.id,
      planned_activity_id: plannedActivity.id,
    },
  })

  return NextResponse.json({
    plannedActivity,
    calendar: await getCalendarDashboardData(supabase, ownerProfile),
  })
}
