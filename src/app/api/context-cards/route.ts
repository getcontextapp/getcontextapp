import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateLiveContextCard } from '@/lib/anthropic'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await request.json().catch(() => ({}))

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id) {
    return NextResponse.json({ error: 'No household' }, { status: 400 })
  }

  // Fetch recent activities for context
  const todayRange = getUtcRangeForLocalDay(new Date(), profile.timezone)
  const { data: recentActivities } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('household_id', profile.household_id)
    .gte('occurred_at', todayRange.start)
    .lt('occurred_at', todayRange.end)
    .order('occurred_at', { ascending: false })
    .limit(10)

  const { data: pendingItems } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', getLocalDateKey(new Date(), profile.timezone))
    .in('status', ['planned', 'not_now'])
    .order('created_at', { ascending: true })
    .limit(10)

  try {
    const generated = await generateLiveContextCard({
      displayName: profile.display_name,
      timeZone: profile.timezone,
      pendingItems: pendingItems ?? [],
      completedActivities: recentActivities ?? [],
    })

    await supabase
      .from('context_cards')
      .update({ is_active: false })
      .eq('household_id', profile.household_id)
      .eq('is_active', true)

    const card = {
      id: crypto.randomUUID(),
      household_id: profile.household_id,
      activity_log_id: null,
      type: 'open' as const,
      title: generated.title,
      body: generated.body,
      generated_by: 'ai' as const,
      is_active: true,
      created_at: new Date().toISOString(),
    }

    await trackEvent(supabase, {
      eventName: 'context_card_generated',
      profile,
      userId: user.id,
      properties: {
        card_type: 'live',
        activity_count: recentActivities?.length ?? 0,
        pending_count: pendingItems?.length ?? 0,
        generated_by: 'ai',
      },
    })

    return NextResponse.json(card)
  } catch (error) {
    console.error('[Context Cards] AI generation failed:', error)
    return NextResponse.json({ error: 'AI reflection unavailable' }, { status: 503 })
  }
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id) return NextResponse.json([])

  const { data } = await supabase
    .from('context_cards')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json(data ?? [])
}
