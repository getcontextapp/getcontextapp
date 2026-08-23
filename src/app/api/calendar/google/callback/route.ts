import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { trackEvent } from '@/lib/analytics'
import {
  googleCalendarConfigured,
  isCalendarEnabledForHousehold,
  saveGoogleCalendarConnection,
  verifyCalendarOAuthState,
} from '@/lib/calendar-sync'

function redirectWithStatus(request: NextRequest, path: string, status: 'connected' | 'error') {
  const url = new URL(path, request.url)
  url.searchParams.set('calendar', status)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectWithStatus(request, '/auth/login', 'error')

  const requestUrl = new URL(request.url)
  const error = requestUrl.searchParams.get('error')
  const code = requestUrl.searchParams.get('code')
  const stateValue = requestUrl.searchParams.get('state')
  const state = stateValue ? verifyCalendarOAuthState(stateValue) : null
  const returnTo = state?.returnTo ?? '/mci-user'

  if (error || !code || !state || !googleCalendarConfigured()) {
    return redirectWithStatus(request, returnTo, 'error')
  }

  const { data: connectedByProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (
    !connectedByProfile?.household_id ||
    connectedByProfile.id !== state.connectedByProfileId ||
    connectedByProfile.household_id !== state.householdId
  ) {
    return redirectWithStatus(request, returnTo, 'error')
  }

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', state.ownerProfileId)
    .eq('household_id', state.householdId)
    .single()

  if (!ownerProfile?.household_id) {
    return redirectWithStatus(request, returnTo, 'error')
  }

  const enabled = await isCalendarEnabledForHousehold(supabase, ownerProfile.household_id)
  if (!enabled) return redirectWithStatus(request, returnTo, 'error')

  try {
    const redirectUri = new URL('/api/calendar/google/callback', request.url).toString()
    const connection = await saveGoogleCalendarConnection({
      ownerProfile,
      connectedByProfile,
      code,
      redirectUri,
    })

    await trackEvent(supabase, {
      eventName: 'calendar_connected',
      profile: connectedByProfile,
      userId: user.id,
      properties: {
        provider: 'google',
        owner_profile_id: ownerProfile.id,
        connection_id: connection.id,
      },
    })

    return redirectWithStatus(request, returnTo, 'connected')
  } catch (connectError) {
    console.error('[Calendar] Google callback failed:', connectError instanceof Error ? connectError.message : connectError)
    return redirectWithStatus(request, returnTo, 'error')
  }
}
