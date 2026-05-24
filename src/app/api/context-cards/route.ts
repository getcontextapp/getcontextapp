import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateReentryCard, generateOpenContextCard } from '@/lib/anthropic'

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
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { data: recentActivities } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('household_id', profile.household_id)
    .gte('occurred_at', todayStart.toISOString())
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
      generated = await generateOpenContextCard(profile.display_name, recentActivities)
    }
  } catch (error) {
    console.error('[Context Cards] AI generation failed:', error)
    const labels = recentActivities.slice(0, 3).map(a => a.label).join(', ')
    generated = {
      title: 'Your day so far',
      body: `${profile.display_name}, you have logged ${labels}. This is a good place to keep building your day.`,
    }
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
