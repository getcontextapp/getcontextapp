import { NextRequest, NextResponse } from 'next/server'
import { trackEvent } from '@/lib/analytics'
import { resolveCalendarOwnerProfile } from '@/lib/calendar-sync'
import { createServerClient, createServiceClient } from '@/lib/supabase-server'

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

  const { data: connection, error: connectionError } = await supabase
    .from('calendar_connections')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('owner_profile_id', ownerProfile.id)
    .eq('provider', 'google')
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (connectionError) {
    return NextResponse.json({ error: connectionError.message }, { status: 500 })
  }

  if (connection?.id) {
    const service = createServiceClient()
    await service
      .from('calendar_connection_tokens')
      .update({
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('connection_id', connection.id)
  }

  await trackEvent(supabase, {
    eventName: 'calendar_disconnected',
    profile,
    userId: user.id,
    properties: {
      owner_profile_id: ownerProfile.id,
      provider: 'google',
    },
  })

  return NextResponse.json({ enabled: true, connection: null, events: [] })
}
