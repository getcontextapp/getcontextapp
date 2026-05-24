import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateReentryCard, generateOpenContextCard } from '@/lib/anthropic'
import { getUtcRangeForLocalDay } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'

function getActivityDetail(activity: { label: string; note?: string | null }) {
  const note = activity.note?.trim()
  if (note) return note

  const genericLabels = new Set(['Morning', 'Meal', 'Movement', 'Social', 'Rest', 'Medication', 'Other'])
  if (genericLabels.has(activity.label)) return activity.label.toLowerCase() === 'other' ? 'another activity' : `a ${activity.label.toLowerCase()} activity`

  return activity.label
}

function getDayPart(timeZone?: string | null) {
  const hour = Number(new Date().toLocaleString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    hour12: false,
  }))

  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

function buildFallbackOpenCard(displayName: string, recentActivities: Array<{ label: string; note?: string | null }>, timeZone?: string | null) {
  const details = recentActivities
    .slice(0, 3)
    .map(getActivityDetail)
    .filter(Boolean)

  const dayPart = getDayPart(timeZone)
  const intro =
    dayPart === 'morning' ? `Here is what has happened this morning, ${displayName}.` :
    dayPart === 'afternoon' ? `Here is what has been happening today, ${displayName}.` :
    dayPart === 'evening' ? `Here is what has been part of your day, ${displayName}.` :
    `Here is what is saved from tonight, ${displayName}.`

  const activityText =
    details.length === 0 ? 'There is nothing saved yet.' :
    details.length === 1 ? `Saved here: ${details[0]}.` :
    `Saved here: ${details.slice(0, -1).join(', ')} and ${details[details.length - 1]}.`

  return {
    title: 'Your day so far',
    body: `${intro} ${activityText} This is a good place to return to when you need it.`,
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

  if (!recentActivities || recentActivities.length === 0) {
    return NextResponse.json({ error: 'No activities to generate card from' }, { status: 400 })
  }

  let generated: { title: string; body: string }

  try {
    if (type === 'reentry') {
      const triggerActivity = recentActivities.find(a => a.id === activity_log_id) ?? recentActivities[0]
      const gapMinutes = profile.reminder_gap_minutes ?? 90
      generated = await generateReentryCard({
        displayName: profile.display_name,
        recentActivities,
        triggerActivity,
        gapMinutes,
      })
    } else {
      generated = await generateOpenContextCard(profile.display_name, recentActivities, profile.timezone)
    }
  } catch (error) {
    console.error('[Context Cards] AI generation failed:', error)
    generated = buildFallbackOpenCard(profile.display_name, recentActivities, profile.timezone)
  }

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
      generated_by: 'ai',
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
      activity_count: recentActivities.length,
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
