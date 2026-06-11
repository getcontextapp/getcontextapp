import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { parseSmsPlanReply } from '@/lib/anthropic'
import { trackEvent } from '@/lib/analytics'
import { ACTIVITY_TILES } from '@/types'
import type { ActivityCategory, ExpectedPeriod } from '@/types'

const VALID_CATEGORIES = new Set(ACTIVITY_TILES.map(tile => tile.category))
const VALID_PERIODS = new Set<ExpectedPeriod>(['morning', 'afternoon', 'evening', 'anytime'])

function inferFallbackCategory(note: string): ActivityCategory {
  const lower = note.toLowerCase()
  if (/\b(medicine|medication|pill|pills|vitamin)\b/.test(lower)) return 'medication'
  if (/\b(breakfast|lunch|dinner|meal|eat|drink|snack)\b/.test(lower)) return 'meal'
  if (/\b(walk|exercise|stretch|gym|garden|outside)\b/.test(lower)) return 'movement'
  if (/\b(call|visit|friend|family|neighbor|club|church|meeting)\b/.test(lower)) return 'social'
  if (/\b(rest|nap|sleep|relax|read|watch tv)\b/.test(lower)) return 'rest'
  if (/\b(bath|bathe|shower|wash|dress|brush)\b/.test(lower)) return 'morning'
  return 'custom'
}

function inferFallbackPeriod(note: string): ExpectedPeriod {
  const lower = note.toLowerCase()
  if (/\b(morning|breakfast|a\.?m\.?)\b/.test(lower)) return 'morning'
  if (/\b(afternoon|lunch|noon|midday)\b/.test(lower)) return 'afternoon'
  if (/\b(evening|dinner|tonight|night|before bed|p\.?m\.?)\b/.test(lower)) return 'evening'
  return 'anytime'
}

function cleanFallbackPlan(note: string) {
  return note
    .trim()
    .replace(/^i\s+(?:plan|want|need|hope)\s+to\s+/i, '')
    .replace(/^i\s+will\s+/i, '')
    .replace(/^please\s+(?:add|remind me to)\s+/i, '')
    .replace(/^bath\b/i, 'Bathe')
    .replace(/[.]+$/, '')
    .trim()
    .slice(0, 160)
}

function buildFallbackPlans(message: string) {
  return message
    .split(/[,;\n]+/)
    .map(cleanFallbackPlan)
    .filter(note => note.length > 1)
    .slice(0, 12)
    .map(note => ({
      category: inferFallbackCategory(note),
      note,
      expected_period: inferFallbackPeriod(note),
      confidence: 'medium' as const,
    }))
}

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
    const items = parsed.intent === 'plan' && parsed.items.length > 0
      ? parsed.items
      : buildFallbackPlans(message)
    if (items.length === 0) {
      return NextResponse.json({ error: 'Tell Context one thing you want to do today.' }, { status: 422 })
    }

    await trackEvent(supabase, {
      eventName: 'natural_language_plan_parsed',
      profile,
      userId: user.id,
      properties: {
        item_count: items.length,
        raw_length: message.length,
        used_custom_fallback: parsed.intent !== 'plan' || parsed.items.length === 0,
      },
    })

    return NextResponse.json({ items })
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
