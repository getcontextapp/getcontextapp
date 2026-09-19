import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCalendarDashboardData } from '@/lib/calendar-sync'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'Household setup is needed first.' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { event_id?: string; mark_state?: 'attended' | 'deferred' }
  if (!body.event_id || !body.mark_state) return NextResponse.json({ error: 'Choose an appointment response.' }, { status: 400 })

  const { data: event } = await supabase.from('calendar_events')
    .select('id,household_id,owner_profile_id,starts_at')
    .eq('id', body.event_id).eq('household_id', profile.household_id).eq('status', 'confirmed').maybeSingle()
  if (!event) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })

  const followUpAt = body.mark_state === 'deferred'
    ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
    : null
  const { error } = await supabase.from('calendar_event_marks').upsert({
    household_id: event.household_id,
    calendar_event_id: event.id,
    profile_id: event.owner_profile_id,
    mark_state: body.mark_state,
    marked_at: new Date().toISOString(),
    follow_up_at: followUpAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'calendar_event_id,profile_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const calendar = await getCalendarDashboardData(supabase, profile.role === 'mci_user' ? profile : null)
  return NextResponse.json({ calendar })
}
