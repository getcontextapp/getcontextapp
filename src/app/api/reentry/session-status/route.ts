import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.toLowerCase().includes('recovery_sessions')
    ),
  )
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id || profile.role !== 'mci_user') {
    return NextResponse.json({ error: 'MCI profile required' }, { status: 403 })
  }

  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: session, error } = await supabase
    .from('recovery_sessions')
    .select('id,last_confirmed_text,last_confirmed_at,completed_at')
    .eq('user_id', user.id)
    .eq('session_date', todayKey)
    .eq('status', 'completed')
    .gte('completed_at', twoHoursAgo)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (isMissingTableError(error)) return NextResponse.json({ recentSession: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!session) return NextResponse.json({ recentSession: false })

  await trackEvent(supabase, {
    eventName: 'reentry_session_resumed',
    profile,
    userId: user.id,
    properties: { session_id: session.id },
  })

  return NextResponse.json({
    recentSession: true,
    lastConfirmedText: session.last_confirmed_text,
    lastConfirmedAt: session.last_confirmed_at ?? session.completed_at,
  })
}
