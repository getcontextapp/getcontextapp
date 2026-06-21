import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { trackEvent } from '@/lib/analytics'
import type { TimelineEventConfidence, TimelineEventSource, TimelineEventType } from '@/types'

const VALID_TYPES = new Set<TimelineEventType>(['plan', 'doing_now', 'did', 'completion', 'sms_reply'])
const VALID_SOURCES = new Set<TimelineEventSource>(['user-stated', 'sms', 'plan', 'system'])
const VALID_CONFIDENCE = new Set<TimelineEventConfidence>(['high', 'low'])

async function getCurrentProfile() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { supabase, user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return { supabase, user, profile }
}

export async function GET(request: NextRequest) {
  const { supabase, user, profile } = await getCurrentProfile()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile?.household_id) return NextResponse.json([])

  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') ?? 20)

  const { data, error } = await supabase
    .from('timeline_events')
    .select('*')
    .eq('household_id', profile.household_id)
    .order('created_at', { ascending: false })
    .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getCurrentProfile()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile?.household_id || profile.role !== 'mci_user') {
    return NextResponse.json({ error: 'MCI profile required' }, { status: 403 })
  }

  const body: {
    text?: string
    type?: TimelineEventType
    source?: TimelineEventSource
    confidence?: TimelineEventConfidence
  } = await request.json()

  const text = body.text?.trim().replace(/[—–]/g, ',').slice(0, 240)
  const type = VALID_TYPES.has(body.type as TimelineEventType) ? body.type as TimelineEventType : 'doing_now'
  const source = VALID_SOURCES.has(body.source as TimelineEventSource) ? body.source as TimelineEventSource : 'user-stated'
  const confidence = VALID_CONFIDENCE.has(body.confidence as TimelineEventConfidence)
    ? body.confidence as TimelineEventConfidence
    : 'high'

  if (!text) return NextResponse.json({ error: 'Tell Context what happened.' }, { status: 400 })

  const { data, error } = await supabase
    .from('timeline_events')
    .insert({
      household_id: profile.household_id,
      user_id: user.id,
      profile_id: profile.id,
      text,
      type,
      source,
      confidence,
    })
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not save that note.' }, { status: 500 })
  }

  await trackEvent(supabase, {
    eventName: 'timeline_event_saved',
    profile,
    userId: user.id,
    properties: { timeline_event_id: data.id, type, source, confidence },
  })

  return NextResponse.json({ event: data })
}
