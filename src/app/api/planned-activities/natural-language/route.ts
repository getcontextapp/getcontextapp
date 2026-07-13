import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { parseSmsPlanReply } from '@/lib/anthropic'
import { trackEvent } from '@/lib/analytics'
import { ACTIVITY_TILES } from '@/types'
import { addDaysToKey, periodForTime } from '@/lib/task-scheduling'
import { ensureNextOccurrence, findMatchingRepeatOccurrence, retireRepeatFamily } from '@/lib/task-scheduling-server'
import { getLocalDateKey } from '@/lib/dates'
import { isRecallRequest } from '@/lib/recall-intent'
import type { ActivityCategory, ExpectedPeriod, PlannedActivity, RepeatRule } from '@/types'

const VALID_CATEGORIES = new Set(ACTIVITY_TILES.map(tile => tile.category))
const VALID_PERIODS = new Set<ExpectedPeriod>(['morning', 'afternoon', 'evening', 'anytime'])
const VALID_REPEAT_RULES = new Set<RepeatRule>(['none', 'daily', 'weekdays', 'weekly'])

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

function explicitPeriod(note: string): ExpectedPeriod | undefined {
  const inferred = inferFallbackPeriod(note)
  return inferred === 'anytime' && !/\b(anytime|any time)\b/i.test(note) ? undefined : inferred
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

function detectTimelineCapture(message: string): { type: 'doing_now' | 'did'; text: string } | null {
  const text = message.trim().replace(/[—–]/g, ',').replace(/\s+/g, ' ')
  const lower = text.toLowerCase()
  const nowMatch = lower.match(/^(?:i am|i'm|im|i’m|we are|we're|currently|right now i am|right now i'm|right now im)\s+(.+)$/)
  if (nowMatch) {
    return { type: 'doing_now', text: cleanCaptureText(text.replace(/^(?:i am|i'm|im|i’m|we are|we're|currently|right now i am|right now i'm|right now im)\s+/i, '')) }
  }
  if (/\b(right now|currently|at the moment)\b/i.test(text) && !/\b(at|around)\s+\d{1,2}/i.test(text)) {
    return { type: 'doing_now', text: cleanCaptureText(text.replace(/\b(right now|currently|at the moment)\b/gi, '')) }
  }
  if (/^(?:i just|just|i already|already|i did|i finished|i completed|i had|i took|i went|i called|i made|i ate|i walked|i visited)\b/i.test(text)) {
    return { type: 'did', text: cleanCaptureText(text.replace(/^(?:i just|just|i already|already)\s+/i, '')) }
  }
  if (/\b(just did|just finished|just completed|just had|just took|just went|just called|just made|just ate|just walked|just visited)\b/i.test(text)) {
    return { type: 'did', text: cleanCaptureText(text) }
  }
  return null
}

function cleanCaptureText(text: string) {
  return text
    .trim()
    .replace(/^i\s+(?:am|was|did)\s+/i, '')
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
    .map(note => {
      const expectedTime = parseTime(note)
      return {
        category: inferFallbackCategory(note),
        note,
        expected_period: expectedTime ? periodForTime(expectedTime) : inferFallbackPeriod(note),
        expected_time: expectedTime,
        repeat_rule: requestedRepeat(note) ?? 'none',
        confidence: 'medium' as const,
      }
    })
}

function parseTime(message: string) {
  const match = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const pm = match[3].toLowerCase().startsWith('p')
  if (pm && hour < 12) hour += 12
  if (!pm && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function requestedRepeat(message: string): RepeatRule | undefined {
  if (/\b(weekdays|every weekday|monday through friday)\b/i.test(message)) return 'weekdays'
  if (/\b(every day|daily)\b/i.test(message)) return 'daily'
  if (/\b(every week|weekly)\b/i.test(message)) return 'weekly'
  if (/\b(stop repeating|does not repeat|don't repeat)\b/i.test(message)) return 'none'
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
    action?: 'parse' | 'save' | 'modify'
    message?: string
    planned_for?: string
    items?: Array<{
      category?: ActivityCategory
      note?: string
      expected_period?: ExpectedPeriod
      expected_time?: string | null
      repeat_rule?: RepeatRule
    }>
    modification?: {
      id?: string
      note?: string
      expected_period?: ExpectedPeriod
      expected_time?: string | null
      repeat_rule?: RepeatRule
      planned_for?: string
    }
  } = await request.json()

  if (body.action === 'parse') {
    const message = body.message?.trim().slice(0, 1000)
    if (!message) return NextResponse.json({ error: 'Tell Context what you plan to do.' }, { status: 400 })

    if (isRecallRequest(message)) {
      await trackEvent(supabase, {
        eventName: 'natural_language_recall_requested',
        profile,
        userId: user.id,
        properties: { raw_length: message.length },
      })
      return NextResponse.json({ recall_request: true })
    }

    if (/\b(change|move|rename|edit|repeat|stop repeating)\b/i.test(message)) {
      const todayKey = getLocalDateKey(new Date(), profile.timezone)
      const { data: waiting } = await supabase.from('planned_activities').select('*')
        .eq('household_id', profile.household_id).eq('planned_for', todayKey)
        .in('status', ['planned', 'not_now'])
      const matches = (waiting ?? []).filter(item => {
        const words = String(item.note || item.label).toLowerCase().split(/\s+/).filter((word: string) => word.length > 3)
        return words.some((word: string) => message.toLowerCase().includes(word))
      })
      if (matches.length === 1) {
        const time = parseTime(message)
        const repeat = requestedRepeat(message)
        const rename = message.match(/\brename\b.+?\bto\s+(.+)$/i)?.[1]?.trim()
        const requestedDay = /\btomorrow\b/i.test(message) ? addDaysToKey(todayKey, 1) : undefined
        return NextResponse.json({
          modification: {
            id: matches[0].id,
            current_note: matches[0].note || matches[0].label,
            note: rename || matches[0].note || matches[0].label,
            expected_period: time ? periodForTime(time) : explicitPeriod(message) ?? matches[0].expected_period,
            expected_time: time ?? matches[0].expected_time,
            repeat_rule: repeat ?? matches[0].repeat_rule ?? 'none',
            planned_for: requestedDay ?? matches[0].planned_for,
          },
        })
      }
      return NextResponse.json({ error: matches.length > 1 ? 'I found more than one matching task. Please name it more specifically.' : 'I could not find that waiting task today.' }, { status: 422 })
    }

    const capture = detectTimelineCapture(message)
    if (capture?.text) {
      await trackEvent(supabase, {
        eventName: 'natural_language_timeline_parsed',
        profile,
        userId: user.id,
        properties: { type: capture.type, raw_length: message.length },
      })
      return NextResponse.json({ capture })
    }

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

  if (body.action === 'modify') {
    const item = body.modification
    if (!item?.id) return NextResponse.json({ error: 'No task selected.' }, { status: 400 })
    const expectedTime = item.expected_time && /^\d{2}:\d{2}$/.test(item.expected_time) ? item.expected_time : null
    const repeatRule = VALID_REPEAT_RULES.has(item.repeat_rule as RepeatRule) ? item.repeat_rule as RepeatRule : 'none'
    const { data: current } = await supabase.from('planned_activities').select('*')
      .eq('id', item.id).eq('household_id', profile.household_id)
      .in('status', ['planned', 'not_now']).maybeSingle()
    if (!current) return NextResponse.json({ error: 'That task is no longer waiting.' }, { status: 404 })
    if (repeatRule === 'none' && current.repeat_rule !== 'none') {
      const { hiddenIds } = await retireRepeatFamily(supabase, current as PlannedActivity)
      return NextResponse.json({
        item: {
          ...current,
          note: item.note?.trim().slice(0, 160) || current.note,
          expected_period: expectedTime ? periodForTime(expectedTime) : item.expected_period ?? current.expected_period,
          expected_time: expectedTime,
          repeat_rule: 'none',
          series_id: null,
          status: 'skipped',
        },
        deleted_planned_activity_ids: hiddenIds.includes(current.id) ? hiddenIds : [current.id, ...hiddenIds],
      })
    }
    if (item.planned_for && item.planned_for !== current.planned_for) {
      const { data: existingOccurrence } = current.series_id
        ? await supabase.from('planned_activities').select('*')
            .eq('series_id', current.series_id).eq('planned_for', item.planned_for).maybeSingle()
        : { data: null }
      if (existingOccurrence) {
        const { data: previous } = await supabase.from('planned_activities')
          .update({ status: 'skipped', updated_at: new Date().toISOString() })
          .eq('id', current.id).select().single()
        return NextResponse.json({ item: existingOccurrence, previous })
      }
      const { data: moved, error: moveError } = await supabase.from('planned_activities').insert({
        household_id: current.household_id,
        created_by: profile.id,
        assigned_to: current.assigned_to,
        category: current.category,
        label: current.label,
        note: item.note?.trim().slice(0, 160) || current.note,
        expected_period: expectedTime ? periodForTime(expectedTime) : item.expected_period ?? current.expected_period,
        expected_time: expectedTime,
        repeat_rule: repeatRule,
        series_id: repeatRule === 'none' ? null : current.series_id ?? current.id,
        moved_from_id: current.id,
        planned_for: item.planned_for,
        source: current.source,
      }).select().single()
      if (moveError || !moved) return NextResponse.json({ error: moveError?.message ?? 'Could not move that task.' }, { status: 500 })
      const { data: previous } = await supabase.from('planned_activities')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('id', current.id).select().single()
      await ensureNextOccurrence(supabase, moved as PlannedActivity)
      return NextResponse.json({ item: moved, previous })
    }

    const { data: updated, error } = await supabase.from('planned_activities').update({
      note: item.note?.trim().slice(0, 160),
      expected_period: expectedTime ? periodForTime(expectedTime) : item.expected_period ?? 'anytime',
      expected_time: expectedTime,
      repeat_rule: repeatRule,
      series_id: repeatRule === 'none' ? null : current.series_id ?? current.id,
      planned_for: current.planned_for,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id).eq('household_id', profile.household_id).in('status', ['planned', 'not_now']).select().single()
    if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Could not change that task.' }, { status: 500 })
    if (repeatRule !== 'none') await ensureNextOccurrence(supabase, updated as PlannedActivity)
    return NextResponse.json({ item: updated })
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
        expected_time: /^\d{2}:\d{2}$/.test(item.expected_time ?? '') ? item.expected_time! : null,
        repeat_rule: VALID_REPEAT_RULES.has(item.repeat_rule as RepeatRule) ? item.repeat_rule as RepeatRule : 'none' as RepeatRule,
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
      expected_time: item.expected_time,
      planned_for: body.planned_for,
      repeat_rule: item.repeat_rule,
      source: 'manual',
    }))

    const plannedItems: PlannedActivity[] = []
    for (const row of rows) {
      if (row.repeat_rule !== 'none') {
        const existingRepeat = await findMatchingRepeatOccurrence(supabase, row as PlannedActivity, body.planned_for)
        if (existingRepeat) {
          plannedItems.push(existingRepeat as PlannedActivity)
          continue
        }
      }

      const { data: created, error } = await supabase
        .from('planned_activities')
        .insert(row)
        .select()
        .single()

      if (error || !created) {
        return NextResponse.json({ error: error?.message ?? 'Could not save these plans.' }, { status: 500 })
      }
      plannedItems.push(created as PlannedActivity)
    }

    for (const item of plannedItems.filter(item => item.repeat_rule !== 'none')) {
      if (item.series_id) continue
      const { data: source, error: seriesError } = await supabase.from('planned_activities')
        .update({ series_id: item.id }).eq('id', item.id).select().single()
      if (seriesError || !source) {
        return NextResponse.json({ error: seriesError?.message ?? 'Could not start repeating task.' }, { status: 500 })
      }
      Object.assign(item, source)
      await ensureNextOccurrence(supabase, source as PlannedActivity)
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
