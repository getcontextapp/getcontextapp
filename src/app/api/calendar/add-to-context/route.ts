import { NextRequest, NextResponse } from 'next/server'
import { trackEvent } from '@/lib/analytics'
import { getLocalDateKey } from '@/lib/dates'
import { getCalendarDashboardData, resolveCalendarOwnerProfile } from '@/lib/calendar-sync'
import { periodForTime } from '@/lib/task-scheduling'
import { createServerClient } from '@/lib/supabase-server'
import type { ExpectedPeriod } from '@/types'

function localTimeHHMM(date: Date, timeZone?: string | null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone ?? undefined,
  }).formatToParts(date)
  const hour = parts.find(part => part.type === 'hour')?.value ?? '00'
  const minute = parts.find(part => part.type === 'minute')?.value ?? '00'
  return `${hour === '24' ? '00' : hour}:${minute}`
}

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

  const body = await request.json().catch(() => ({})) as { owner_profile_id?: string; event_id?: string }
  const ownerProfile = await resolveCalendarOwnerProfile(supabase, profile, body.owner_profile_id)
  if (!ownerProfile?.household_id || ownerProfile.household_id !== profile.household_id) {
    return NextResponse.json({ error: 'Calendar owner was not found.' }, { status: 403 })
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

  const start = new Date(event.starts_at)
  const expectedTime = event.all_day ? null : localTimeHHMM(start, ownerProfile.timezone)
  const plannedFor = getLocalDateKey(start, ownerProfile.timezone)
  const expectedPeriod: ExpectedPeriod = expectedTime ? periodForTime(expectedTime) : 'anytime'

  const { data: existingPlans } = await supabase
    .from('planned_activities')
    .select('id')
    .eq('household_id', ownerProfile.household_id)
    .eq('assigned_to', ownerProfile.id)
    .eq('planned_for', plannedFor)
    .ilike('label', event.title)
    .in('status', ['planned', 'not_now', 'confirmed'])
    .limit(1)

  if (existingPlans && existingPlans.length > 0) {
    return NextResponse.json({ error: "This is already in today's Context plan." }, { status: 409 })
  }

  const { data: plannedActivity, error: insertError } = await supabase
    .from('planned_activities')
    .insert({
      household_id: ownerProfile.household_id,
      created_by: profile.id,
      assigned_to: ownerProfile.id,
      category: 'custom',
      label: event.title,
      note: event.location || null,
      expected_period: expectedPeriod,
      expected_time: expectedTime,
      planned_for: plannedFor,
      repeat_rule: 'none',
      source: 'manual',
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
