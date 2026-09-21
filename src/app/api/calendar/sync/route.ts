import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { trackEvent } from '@/lib/analytics'
import { getCalendarRangeData, resolveCalendarOwnerProfile } from '@/lib/calendar-sync'
import { getLocalDateKey, getUtcRangeForLocalDateKey } from '@/lib/dates'

function dateOffset(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
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

  const body = await request.json().catch(() => ({})) as { owner_profile_id?: string; future_days?: number }
  const ownerProfile = await resolveCalendarOwnerProfile(supabase, profile, body.owner_profile_id)
  if (!ownerProfile?.household_id || ownerProfile.household_id !== profile.household_id) {
    return NextResponse.json({ error: 'Calendar owner was not found.' }, { status: 403 })
  }

  const futureDays = body.future_days === 365 ? 365 : 70
  // Return the same full range the calendar page displays. Returning only the
  // dashboard's today/tomorrow slice would overwrite and hide future events
  // after a successful refresh.
  const todayKey = getLocalDateKey(new Date(), ownerProfile.timezone)
  const start = getUtcRangeForLocalDateKey(dateOffset(todayKey, -35), ownerProfile.timezone).start
  const end = getUtcRangeForLocalDateKey(dateOffset(todayKey, futureDays), ownerProfile.timezone).start
  const calendar = await getCalendarRangeData(supabase, ownerProfile, start, end, futureDays, true)
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
