import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'
import { buildContextRankInput } from '@/lib/context-rank-adapter'
import { applyFeedback, runContextRank, type ContinuityCard, type RecoveryIntent, type RecoverySession } from '@/lib/context-rank'

type FeedbackResponse = 'confirmed' | 'rejected' | 'corrected'

const RESPONSES = new Set<FeedbackResponse>(['confirmed', 'rejected', 'corrected'])
const INTENTS = new Set<RecoveryIntent>([
  'what_was_i_doing',
  'where_did_i_leave_off',
  'what_should_i_do_next',
  'did_i_finish_this',
  'what_changed_today',
])

async function recordShownCandidates(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  profile: any,
  session: RecoverySession,
  card: ContinuityCard,
) {
  if (card.candidates.length === 0) return
  const now = new Date().toISOString()
  const sessionDate = getLocalDateKey(new Date(now), profile.timezone)
  await supabase.from('recovery_session_moments').upsert(
    card.candidates.map(candidate => ({
      session_id: session.id,
      user_id: profile.user_id,
      household_id: profile.household_id,
      profile_id: profile.id,
      session_date: sessionDate,
      moment_key: candidate.episode.id,
      answer_text: candidate.episode.activityLabel,
      confidence: String(candidate.confidence),
      status: 'shown',
      shown_at: now,
    })),
    { onConflict: 'session_id,moment_key', ignoreDuplicates: true },
  )
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
  const sessionId = typeof body.session_id === 'string' ? body.session_id : ''
  const episodeId = typeof body.episode_id === 'string' ? body.episode_id : ''
  const intent = body.intent as RecoveryIntent
  const response = body.response as FeedbackResponse
  const answerText = typeof body.answer_text === 'string' ? body.answer_text.trim().slice(0, 500) : ''
  const activityText = typeof body.activity_text === 'string' ? body.activity_text.trim().slice(0, 240) : ''
  const correctionText = typeof body.correction_text === 'string' ? body.correction_text.trim().slice(0, 500) : ''
  const confidence = Number.isFinite(Number(body.confidence)) ? Number(body.confidence) : null

  if (!sessionId || !episodeId || !RESPONSES.has(response) || !INTENTS.has(intent)) {
    return NextResponse.json({ error: 'Missing recovery feedback.' }, { status: 400 })
  }

  const now = Date.now()
  const todayKey = getLocalDateKey(new Date(now), profile.timezone)
  const status = response === 'confirmed' ? 'confirmed' : response === 'rejected' ? 'rejected' : 'rejected'

  const { error: momentError } = await supabase
    .from('recovery_session_moments')
    .upsert({
      session_id: sessionId,
      user_id: user.id,
      household_id: profile.household_id,
      profile_id: profile.id,
      session_date: todayKey,
      moment_key: episodeId,
      answer_text: correctionText || activityText || answerText || null,
      confidence: confidence === null ? null : String(confidence),
      status,
      responded_at: new Date(now).toISOString(),
    }, { onConflict: 'session_id,moment_key' })

  if (momentError) return NextResponse.json({ error: momentError.message }, { status: 500 })

  if (response === 'corrected' && correctionText) {
    await supabase.from('timeline_events').insert({
      household_id: profile.household_id,
      user_id: user.id,
      profile_id: profile.id,
      text: correctionText,
      type: 'did',
      source: 'user-stated',
      confidence: 'high',
    })
  }

  if (response === 'confirmed' && (activityText || answerText)) {
    await supabase.from('timeline_events').insert({
      household_id: profile.household_id,
      user_id: user.id,
      profile_id: profile.id,
      text: activityText || answerText,
      type: 'did',
      source: 'user-stated',
      confidence: 'high',
    })
  }

  await trackEvent(supabase, {
    eventName: 'context_rank_recovery_feedback',
    profile,
    userId: user.id,
    properties: {
      intent,
      response,
      episode_id: episodeId,
      confidence,
    },
  })

  if (response === 'confirmed') {
    await supabase
      .from('recovery_sessions')
      .update({
        status: 'active',
        last_confirmed_text: activityText || answerText || correctionText || null,
        last_confirmed_at: new Date(now).toISOString(),
      })
      .eq('id', sessionId)

    const { evidence, session } = await buildContextRankInput({
      supabase,
      profile,
      queryTime: now,
      intent,
      sessionId,
    })
    const nextSession = applyFeedback(session, episodeId, response, now)
    const result = runContextRank({
      evidence,
      query: { userId: user.id, queryTime: now, intent },
      session: nextSession,
    })

    await recordShownCandidates(supabase, profile, result.session, result.card)

    if (result.card.mode === 'abstain') {
      await supabase
        .from('recovery_sessions')
        .update({
          status: 'completed',
          completed_at: new Date(now).toISOString(),
        })
        .eq('id', sessionId)

      return NextResponse.json({
        resolved: true,
        message: "I'll remember that. That's everything I know right now.",
        session: result.session,
      })
    }

    return NextResponse.json({
      resolved: false,
      session: result.session,
      card: result.card,
    })
  }

  const { evidence, session } = await buildContextRankInput({
    supabase,
    profile,
    queryTime: now,
    intent,
    sessionId,
  })
  const nextSession = applyFeedback(session, episodeId, response, now)
  const result = runContextRank({
    evidence,
    query: { userId: user.id, queryTime: now, intent },
    session: nextSession,
  })

  await recordShownCandidates(supabase, profile, result.session, result.card)

  if (result.card.mode === 'abstain') {
    await supabase
      .from('recovery_sessions')
      .update({
        status: 'completed',
        completed_at: new Date(now).toISOString(),
      })
      .eq('id', sessionId)
  }

  return NextResponse.json({
    resolved: result.card.mode === 'abstain',
    session: result.session,
    card: result.card,
  })
}
