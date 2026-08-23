import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { trackEvent } from '@/lib/analytics'
import {
  createCalendarOAuthState,
  googleAuthUrl,
  googleCalendarConfigured,
  isCalendarEnabledForHousehold,
  resolveCalendarOwnerProfile,
} from '@/lib/calendar-sync'

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

  if (!googleCalendarConfigured()) {
    return NextResponse.json({ error: 'Google Calendar is not ready yet.' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({})) as { owner_profile_id?: string }
  const ownerProfile = await resolveCalendarOwnerProfile(supabase, profile, body.owner_profile_id)
  if (!ownerProfile?.household_id || ownerProfile.household_id !== profile.household_id) {
    return NextResponse.json({ error: 'Calendar owner was not found.' }, { status: 403 })
  }

  const enabled = await isCalendarEnabledForHousehold(supabase, ownerProfile.household_id)
  if (!enabled) {
    return NextResponse.json({ error: 'Calendar preview is not enabled for this household.' }, { status: 403 })
  }

  const redirectUri = new URL('/api/calendar/google/callback', request.url).toString()
  const state = createCalendarOAuthState({
    ownerProfileId: ownerProfile.id,
    connectedByProfileId: profile.id,
    householdId: ownerProfile.household_id,
    returnTo: profile.role === 'care_partner' ? '/care-partner' : '/mci-user',
  })

  await trackEvent(supabase, {
    eventName: 'calendar_connect_started',
    profile,
    userId: user.id,
    properties: {
      provider: 'google',
      owner_profile_id: ownerProfile.id,
      setup_by_role: profile.role,
    },
  })

  return NextResponse.json({ url: googleAuthUrl({ state, redirectUri }) })
}
