import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateReentryCard } from '@/lib/anthropic'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'

function getActivityDetail(activity: { label: string; note?: string | null }) {
  const note = activity.note?.trim()
  if (note) return note

  const genericLabels = new Set(['Morning', 'Meal', 'Movement', 'Social', 'Rest', 'Medication', 'Other'])
  if (genericLabels.has(activity.label)) return activity.label.toLowerCase() === 'other' ? 'another activity' : `a ${activity.label.toLowerCase()} activity`

  return activity.label
}

function formatList(items: string[]) {
  if (items.length === 0) return 'None.'
  return `${items.slice(0, 3).join(', ')}.`
}

function buildOpenCard(
  recentActivities: Array<{ label: string; note?: string | null }>,
  pendingItems: Array<{ label: string; note?: string | null }>,
) {
  const done = recentActivities
    .slice(0, 3)
    .map(getActivityDetail)
    .filter(Boolean)
  const waiting = pendingItems
    .slice(0, 3)
    .map(getActivityDetail)
    .filter(Boolean)

  if (done.length === 0 && waiting.length === 0) return null

  return {
    title: 'Your day so far',
    body: [
      `Done today: ${formatList(done)}`,
      `Still waiting: ${formatList(waiting)}`,
      `You can mark something done or leave it for later.`,
    ].join('\n'),
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { activity_log_id, type = 'open' } = body

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

  if (type === 'open' && (!recentActivities || recentActivities.length === 0) && (!pendingItems || pendingItems.length === 0)) {
    return NextResponse.json({ error: 'No activities to generate card from' }, { status: 400 })
  }

  if (type === 'reentry' && (!recentActivities || recentActivities.length === 0)) {
    return NextResponse.json({ error: 'No activities to generate card from' }, { status: 400 })
  }

  let generated: { title: string; body: string } | null

  try {
    if (type === 'reentry') {
      const triggerActivity = recentActivities!.find(a => a.id === activity_log_id) ?? recentActivities![0]
      const gapMinutes = profile.reminder_gap_minutes ?? 90
      generated = await generateReentryCard({
        displayName: profile.display_name,
        recentActivities: recentActivities!,
        triggerActivity,
        gapMinutes,
      })
    } else {
      generated = buildOpenCard(recentActivities ?? [], pendingItems ?? [])
    }
  } catch (error) {
    console.error('[Context Cards] AI generation failed:', error)
    generated = type === 'open' ? buildOpenCard(recentActivities ?? [], pendingItems ?? []) : null
  }

  if (!generated) {
    return NextResponse.json({ error: 'No useful context card to show' }, { status: 400 })
  }

  const { data: existingCard } = await supabase
    .from('context_cards')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('type', type)
    .eq('is_active', true)
    .eq('title', generated.title)
    .eq('body', generated.body)
    .maybeSingle()

  if (existingCard) return NextResponse.json(existingCard)

  // Deactivate old active cards of same type
  await supabase
    .from('context_cards')
    .update({ is_active: false })
    .eq('household_id', profile.household_id)
    .eq('type', type)
    .eq('is_active', true)

  // Insert new card
  const { data: card, error } = await supabase
    .from('context_cards')
    .insert({
      household_id: profile.household_id,
      activity_log_id: activity_log_id ?? null,
      type,
      title: generated.title,
      body: generated.body,
      generated_by: type === 'open' ? 'user' : 'ai',
      is_active: true,
    })
    .select()
    .single()

  if (error || !card) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  await trackEvent(supabase, {
    eventName: 'context_card_generated',
    profile,
    userId: user.id,
    properties: {
      card_id: card.id,
      card_type: card.type,
      activity_count: recentActivities?.length ?? 0,
      pending_count: pendingItems?.length ?? 0,
      generated_by: card.generated_by,
    },
  })

  return NextResponse.json(card)
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

  const { data } = await supabase
    .from('context_cards')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json(data ?? [])
}
