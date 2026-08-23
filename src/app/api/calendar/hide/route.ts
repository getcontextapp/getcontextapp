import { NextRequest, NextResponse } from 'next/server'
import { trackEvent } from '@/lib/analytics'
import { getCalendarDashboardData, resolveCalendarOwnerProfile } from '@/lib/calendar-sync'
import { createServerClient } from '@/lib/supabase-server'

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
    .update({ hidden_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', body.event_id)
    .eq('owner_profile_id', ownerProfile.id)
    .eq('household_id', ownerProfile.household_id)
    .select('id,title')
    .single()

  if (eventError || !event) {
    return NextResponse.json({ error: eventError?.message ?? 'Could not hide this calendar event.' }, { status: 500 })
  }

  await trackEvent(supabase, {
    eventName: 'calendar_event_hidden',
    profile,
    userId: user.id,
    properties: {
      owner_profile_id: ownerProfile.id,
      calendar_event_id: event.id,
    },
  })

  return NextResponse.json(await getCalendarDashboardData(supabase, ownerProfile))
}
