import { NextRequest, NextResponse } from 'next/server'
import { isAnalyticsAdmin } from '@/lib/admin'
import { loadPilotAnalytics, OUTCOME_MEASURES, type OutcomeRole, type OutcomeSession } from '@/lib/pilot-analytics'
import { createServiceClient } from '@/lib/supabase-server'

const VALID_ROLES = new Set<OutcomeRole>(['mci', 'cp'])
const VALID_SESSIONS = new Set<OutcomeSession>(['pre', 'post'])
const VALID_MEASURES = new Set(OUTCOME_MEASURES.map(measure => `${measure.role}:${measure.key}`))

export async function POST(request: NextRequest) {
  if (!(await isAnalyticsAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const householdId = typeof body.householdId === 'string' ? body.householdId : ''
  const profileId = typeof body.profileId === 'string' ? body.profileId : ''
  const role = body.role as OutcomeRole
  const session = body.session as OutcomeSession
  const measureKey = typeof body.measureKey === 'string' ? body.measureKey : ''
  const score = Number(body.score)

  if (!householdId || !profileId) return NextResponse.json({ error: 'Missing dyad participant.' }, { status: 400 })
  if (!VALID_ROLES.has(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  if (!VALID_SESSIONS.has(session)) return NextResponse.json({ error: 'Invalid session.' }, { status: 400 })
  if (!VALID_MEASURES.has(`${role}:${measureKey}`)) return NextResponse.json({ error: 'Invalid measure.' }, { status: 400 })
  if (!Number.isInteger(score) || score < 1 || score > 5) return NextResponse.json({ error: 'Score must be 1 to 5.' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('study_outcomes')
    .upsert({
      household_id: householdId,
      profile_id: profileId,
      role,
      session,
      measure_key: measureKey,
      score,
      recorded_at: new Date().toISOString(),
    }, { onConflict: 'household_id,profile_id,role,session,measure_key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const data = await loadPilotAnalytics({ days: 30, householdId, role: '' })
  const row = data.outcomeRows[0]
  return NextResponse.json({ ok: true, row })
}
