import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'
import { buildContextRankInput } from '@/lib/context-rank-adapter'
import { runContextRank, type ContinuityCard, type RecoveryIntent, type RecoverySession } from '@/lib/context-rank'

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
  const intent = body.intent as RecoveryIntent
  const sessionId = typeof body.session_id === 'string' ? body.session_id : null

  if (!INTENTS.has(intent)) {
    return NextResponse.json({ error: 'Invalid recovery intent' }, { status: 400 })
  }

  const queryTime = Date.now()
  const { evidence, session } = await buildContextRankInput({
    supabase,
    profile,
    queryTime,
    intent,
    sessionId,
  })
  const result = runContextRank({
    evidence,
    query: { userId: user.id, queryTime, intent },
    session,
  })

  await recordShownCandidates(supabase, profile, result.session, result.card)

  await trackEvent(supabase, {
    eventName: 'context_rank_recovery_presented',
    profile,
    userId: user.id,
    properties: {
      intent,
      mode: result.card.mode,
      candidate_count: result.card.candidates.length,
      top_score: result.card.candidates[0]?.score ?? null,
      top_confidence: result.card.candidates[0]?.confidence ?? null,
    },
  })

  return NextResponse.json({
    session: result.session,
    card: result.card,
  })
}
