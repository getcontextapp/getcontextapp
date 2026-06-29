import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'

type RecoveryAction = 'confirmed' | 'rejected' | 'exhausted'

function isMissingRecoveryMomentTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.toLowerCase().includes('recovery_session_moments')
    ),
  )
}

async function getOrCreateSession(supabase: Awaited<ReturnType<typeof createServerClient>>, profile: any, userId: string, todayKey: string) {
  const { data: existing, error: lookupError } = await supabase
    .from('recovery_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_date', todayKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupError) return { session: null, error: lookupError }
  if (existing) return { session: existing, error: null }

  const { data: created, error: createError } = await supabase
    .from('recovery_sessions')
    .insert({
      user_id: userId,
      household_id: profile.household_id,
      profile_id: profile.id,
      session_date: todayKey,
      status: 'active',
    })
    .select('*')
    .single()

  return { session: created, error: createError }
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

  if (!profile?.household_id || profile.role !== 'mci_user') {
    return NextResponse.json({ error: 'MCI profile required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const action = body.action as RecoveryAction
  const confirmedText = typeof body.confirmed_text === 'string' ? body.confirmed_text.trim().slice(0, 500) : ''
  const confidence = typeof body.confidence === 'string' ? body.confidence : null
  const momentKey = typeof body.moment_key === 'string' ? body.moment_key.trim().slice(0, 200) : ''
  const momentsReviewed = Number.isFinite(Number(body.moments_reviewed)) ? Number(body.moments_reviewed) : undefined

  if (!['confirmed', 'rejected', 'exhausted'].includes(action)) {
    return NextResponse.json({ error: 'Invalid recovery action' }, { status: 400 })
  }

  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const { session, error: sessionError } = await getOrCreateSession(supabase, profile, user.id, todayKey)
  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? 'Could not start recovery session.' }, { status: 500 })
  }

  if (action === 'confirmed') {
    if (!confirmedText) return NextResponse.json({ error: 'Missing confirmed text.' }, { status: 400 })
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('recovery_sessions')
      .update({
        last_confirmed_text: confirmedText,
        last_confirmed_at: now,
        status: 'active',
      })
      .eq('id', session.id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    if (momentKey) {
      const { error: momentError } = await supabase
        .from('recovery_session_moments')
        .upsert({
          session_id: session.id,
          user_id: user.id,
          household_id: profile.household_id,
          profile_id: profile.id,
          session_date: todayKey,
          moment_key: momentKey,
          answer_text: confirmedText,
          confidence,
          status: 'confirmed',
          shown_at: now,
          responded_at: now,
        }, { onConflict: 'user_id,session_date,moment_key' })

      if (momentError && !isMissingRecoveryMomentTable(momentError)) {
        return NextResponse.json({ error: momentError.message }, { status: 500 })
      }
    }

    const { error: timelineError } = await supabase
      .from('timeline_events')
      .insert({
        household_id: profile.household_id,
        user_id: user.id,
        profile_id: profile.id,
        text: confirmedText,
        type: 'did',
        source: 'user-stated',
        confidence: 'high',
      })

    if (timelineError) return NextResponse.json({ error: timelineError.message }, { status: 500 })

    await trackEvent(supabase, {
      eventName: 'reentry_moment_confirmed',
      profile,
      userId: user.id,
      properties: { confidence, answer_text: confirmedText, moment_key: momentKey || null },
    })

    return NextResponse.json({ ok: true })
  }

  if (action === 'rejected') {
    if (momentKey) {
      const now = new Date().toISOString()
      const { error: momentError } = await supabase
        .from('recovery_session_moments')
        .upsert({
          session_id: session.id,
          user_id: user.id,
          household_id: profile.household_id,
          profile_id: profile.id,
          session_date: todayKey,
          moment_key: momentKey,
          answer_text: confirmedText || null,
          confidence,
          status: 'rejected',
          shown_at: now,
          responded_at: now,
        }, { onConflict: 'user_id,session_date,moment_key' })

      if (momentError && !isMissingRecoveryMomentTable(momentError)) {
        return NextResponse.json({ error: momentError.message }, { status: 500 })
      }
    }

    await trackEvent(supabase, {
      eventName: 'reentry_moment_rejected',
      profile,
      userId: user.id,
      properties: { confidence, moment_key: momentKey || null },
    })
    return NextResponse.json({ ok: true })
  }

  const { error: exhaustedError } = await supabase
    .from('recovery_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', session.id)

  if (exhaustedError) return NextResponse.json({ error: exhaustedError.message }, { status: 500 })

  await trackEvent(supabase, {
    eventName: 'reentry_session_exhausted',
    profile,
    userId: user.id,
    properties: { moments_reviewed: momentsReviewed ?? null },
  })

  return NextResponse.json({ ok: true })
}
