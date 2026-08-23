import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { trackEvent } from '@/lib/analytics'
import { getCalendarDashboardData, resolveCalendarOwnerProfile } from '@/lib/calendar-sync'

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

  const body = await request.json().catch(() => ({})) as { owner_profile_id?: string }
  const ownerProfile = await resolveCalendarOwnerProfile(supabase, profile, body.owner_profile_id)
  if (!ownerProfile?.household_id || ownerProfile.household_id !== profile.household_id) {
    return NextResponse.json({ error: 'Calendar owner was not found.' }, { status: 403 })
  }

  const calendar = await getCalendarDashboardData(supabase, ownerProfile)
  await trackEvent(supabase, {
    eventName: 'calendar_synced',
    profile,
    userId: user.id,
    properties: {
      provider: 'google',
      owner_profile_id: ownerProfile.id,
      event_count: calendar.events.length,
      has_connection: Boolean(calendar.connection),
    },
  })

  return NextResponse.json(calendar)
}
