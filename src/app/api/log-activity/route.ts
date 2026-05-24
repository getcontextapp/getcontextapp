import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS, buildReentryMessage } from '@/lib/twilio'
import { trackEvent } from '@/lib/analytics'
import type { LogActivityPayload } from '@/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://getcontextapp.com'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: LogActivityPayload = await request.json()

  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id) {
    return NextResponse.json({ error: 'No household linked' }, { status: 400 })
  }

  // Insert activity log
  const { data: activity, error } = await supabase
    .from('activity_logs')
    .insert({
      household_id: profile.household_id,
      logged_by: profile.id,
      category: body.category,
      label: body.label,
      note: body.note ?? null,
      occurred_at: body.occurred_at ?? new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !activity) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  await trackEvent(supabase, {
    eventName: 'activity_logged',
    profile,
    userId: user.id,
    properties: {
      activity_id: activity.id,
      category: activity.category,
      has_note: Boolean(activity.note),
    },
  })

  // Vercel cron handles SMS reminders separately. The current MVP reminder
  // logic nudges pending planned activities, not manual logging.

  return NextResponse.json(activity)
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id) return NextResponse.json([])

  const url = new URL(request.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '20')
  const since = url.searchParams.get('since')

  let query = supabase
    .from('activity_logs')
    .select('*')
    .eq('household_id', profile.household_id)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (since) query = query.gte('occurred_at', since)

  const { data } = await query
  return NextResponse.json(data ?? [])
}
