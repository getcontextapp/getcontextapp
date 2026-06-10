import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { parseSmsPlanReply } from '@/lib/anthropic'
import { trackEvent } from '@/lib/analytics'
import { ACTIVITY_TILES } from '@/types'
import type { ActivityCategory, ExpectedPeriod } from '@/types'

const VALID_CATEGORIES = new Set(ACTIVITY_TILES.map(tile => tile.category))
const VALID_PERIODS = new Set<ExpectedPeriod>(['morning', 'afternoon', 'evening', 'anytime'])

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

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getCurrentProfile()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile?.household_id || profile.role !== 'mci_user') {
    return NextResponse.json({ error: 'MCI profile required' }, { status: 403 })
  }

  const body: {
    action?: 'parse' | 'save'
    message?: string
    planned_for?: string
    items?: Array<{
      category?: ActivityCategory
      note?: string
      expected_period?: ExpectedPeriod
    }>
  } = await request.json()

  if (body.action === 'parse') {
    const message = body.message?.trim().slice(0, 1000)
    if (!message) return NextResponse.json({ error: 'Tell Context what you plan to do.' }, { status: 400 })

    const parsed = await parseSmsPlanReply(message, profile.display_name, profile.timezone)
    if (parsed.intent !== 'plan' || parsed.items.length === 0) {
      return NextResponse.json({
        error: 'I could not find a clear plan yet. Try listing one or more things you want to do today.',
      }, { status: 422 })
    }

    await trackEvent(supabase, {
      eventName: 'natural_language_plan_parsed',
      profile,
      userId: user.id,
      properties: {
        item_count: parsed.items.length,
        raw_length: message.length,
      },
    })

    return NextResponse.json({ items: parsed.items })
  }

  if (body.action === 'save') {
    const items = (body.items ?? [])
      .slice(0, 12)
      .map(item => ({
        category: VALID_CATEGORIES.has(item.category as ActivityCategory)
          ? item.category as ActivityCategory
          : 'custom' as ActivityCategory,
        note: item.note?.trim().slice(0, 160) ?? '',
        expected_period: VALID_PERIODS.has(item.expected_period as ExpectedPeriod)
          ? item.expected_period as ExpectedPeriod
          : 'anytime' as ExpectedPeriod,
      }))
      .filter(item => item.note.length > 0)

    if (items.length === 0 || !body.planned_for) {
      return NextResponse.json({ error: 'Keep at least one plan before saving.' }, { status: 400 })
    }

    const rows = items.map(item => ({
      household_id: profile.household_id,
      created_by: profile.id,
      assigned_to: profile.id,
      category: item.category,
      label: ACTIVITY_TILES.find(tile => tile.category === item.category)?.label ?? 'Other',
      note: item.note,
      expected_period: item.expected_period,
      planned_for: body.planned_for,
      source: 'manual',
    }))

    const { data: plannedItems, error } = await supabase
      .from('planned_activities')
      .insert(rows)
      .select()

    if (error || !plannedItems) {
      return NextResponse.json({ error: error?.message ?? 'Could not save these plans.' }, { status: 500 })
    }

    await trackEvent(supabase, {
      eventName: 'natural_language_plan_saved',
      profile,
      userId: user.id,
      properties: {
        item_count: plannedItems.length,
        planned_activity_ids: plannedItems.map(item => item.id),
      },
    })

    return NextResponse.json({ items: plannedItems })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
