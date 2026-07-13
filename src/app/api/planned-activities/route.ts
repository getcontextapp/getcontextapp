import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { trackEvent } from '@/lib/analytics'
import { periodForTime } from '@/lib/task-scheduling'
import { ensureNextOccurrence, findMatchingRepeatFamily, findMatchingRepeatOccurrence } from '@/lib/task-scheduling-server'
import type { CreatePlannedActivityPayload, ExpectedPeriod, PlannedActivity, RepeatRule } from '@/types'

const REPEAT_RULES = new Set<RepeatRule>(['none', 'daily', 'weekdays', 'weekly'])

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
  if (!profile?.household_id) return NextResponse.json({ error: 'No household linked' }, { status: 400 })

  const body: CreatePlannedActivityPayload = await request.json()
  if (!body.planned_for) {
    return NextResponse.json({ error: 'Choose a day for this plan.' }, { status: 400 })
  }
  const repeatRule = REPEAT_RULES.has(body.repeat_rule as RepeatRule) ? body.repeat_rule as RepeatRule : 'none'
  const expectedTime = /^\d{2}:\d{2}$/.test(body.expected_time ?? '') ? body.expected_time! : null
  const expectedPeriod = expectedTime ? periodForTime(expectedTime) : body.expected_period
  const candidate = {
    household_id: profile.household_id,
    created_by: profile.id,
    assigned_to: profile.id,
    category: body.category,
    label: body.label,
    note: body.note?.trim() || null,
    expected_period: expectedPeriod,
    expected_time: expectedTime,
    planned_for: body.planned_for,
    repeat_rule: repeatRule,
    source: 'manual',
  } as PlannedActivity

  if (repeatRule !== 'none') {
    const existingRepeat = await findMatchingRepeatOccurrence(supabase, candidate, body.planned_for)
    if (existingRepeat) return NextResponse.json(existingRepeat)
  }

  const { data: plannedActivity, error } = await supabase
    .from('planned_activities')
    .insert(candidate)
    .select()
    .single()

  if (error || !plannedActivity) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  if (repeatRule !== 'none') {
    const { data: source, error: seriesError } = await supabase
      .from('planned_activities')
      .update({ series_id: plannedActivity.id })
      .eq('id', plannedActivity.id)
      .select()
      .single()
    if (seriesError || !source) {
      return NextResponse.json({ error: seriesError?.message ?? 'Could not start repeating task.' }, { status: 500 })
    }
    Object.assign(plannedActivity, source)
    await ensureNextOccurrence(supabase, source as PlannedActivity)
  }

  await trackEvent(supabase, {
    eventName: 'planned_activity_created',
    profile,
    userId: user.id,
    properties: {
      planned_activity_id: plannedActivity.id,
      category: plannedActivity.category,
      expected_period: plannedActivity.expected_period,
      has_note: Boolean(plannedActivity.note),
    },
  })

  return NextResponse.json(plannedActivity)
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, profile } = await getCurrentProfile()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile?.household_id) return NextResponse.json({ error: 'No household linked' }, { status: 400 })

  const body: {
    id?: string
    action?: 'confirm' | 'not_now' | 'skipped' | 'reopen' | 'delete' | 'move' | 'update'
    planned_for?: string
    note?: string
    expected_period?: ExpectedPeriod
    expected_time?: string | null
    repeat_rule?: RepeatRule
    series_scope?: 'one' | 'future'
  } = await request.json()
  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'Missing planned activity or action' }, { status: 400 })
  }

  const { data: plannedActivity, error: fetchError } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('id', body.id)
    .eq('household_id', profile.household_id)
    .single()

  if (fetchError || !plannedActivity) {
    return NextResponse.json({ error: fetchError?.message ?? 'Planned activity not found' }, { status: 404 })
  }

  if (body.action === 'delete') {
    const family = plannedActivity.repeat_rule !== 'none'
      ? await findMatchingRepeatFamily(supabase, plannedActivity as PlannedActivity)
      : [plannedActivity as PlannedActivity]
    const deletableRows = family.filter(item =>
      item.id === plannedActivity.id || ['planned', 'not_now', 'skipped', 'abandoned'].includes(item.status),
    )
    const plannedIds = deletableRows.map(item => item.id)
    const confirmedActivityLogIds = deletableRows
      .map(item => item.confirmed_activity_log_id)
      .filter((id): id is string => Boolean(id))

    const { error } = await supabase
      .from('planned_activities')
      .delete()
      .eq('household_id', profile.household_id)
      .in('id', plannedIds)

    if (error) {
      return NextResponse.json({ error: error.message ?? 'Delete failed' }, { status: 500 })
    }

    if (confirmedActivityLogIds.length > 0) {
      await supabase
        .from('activity_logs')
        .delete()
        .eq('household_id', profile.household_id)
        .in('id', confirmedActivityLogIds)
    }

    await trackEvent(supabase, {
      eventName: 'planned_activity_deleted',
      profile,
      userId: user.id,
      properties: {
        planned_activity_id: plannedActivity.id,
        deleted_planned_activity_ids: plannedIds,
        deleted_activity_ids: confirmedActivityLogIds,
        category: plannedActivity.category,
        previous_status: plannedActivity.status,
        repeat_family_deleted: plannedActivity.repeat_rule !== 'none',
      },
    })

    return NextResponse.json({
      plannedActivity: null,
      activity: null,
      deleted_planned_activity_id: plannedActivity.id,
      deleted_planned_activity_ids: plannedIds,
      deleted_activity_id: plannedActivity.confirmed_activity_log_id,
      deleted_activity_ids: confirmedActivityLogIds,
    })
  }

  if (body.action === 'move') {
    if (!body.planned_for || body.planned_for <= plannedActivity.planned_for) {
      return NextResponse.json({ error: 'Choose a future day.' }, { status: 400 })
    }
    const { data: existingOccurrence } = plannedActivity.series_id
      ? await supabase.from('planned_activities').select('*')
          .eq('series_id', plannedActivity.series_id).eq('planned_for', body.planned_for).maybeSingle()
      : { data: null }
    if (existingOccurrence) {
      const { data: skipped, error: skipError } = await supabase
        .from('planned_activities')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('id', plannedActivity.id)
        .select()
        .single()
      if (skipError || !skipped) {
        return NextResponse.json({ error: skipError?.message ?? 'Move failed' }, { status: 500 })
      }
      return NextResponse.json({ plannedActivity: skipped, movedActivity: existingOccurrence, activity: null })
    }
    const { data: moved, error } = await supabase
      .from('planned_activities')
      .insert({
        household_id: plannedActivity.household_id,
        created_by: profile.id,
        assigned_to: plannedActivity.assigned_to,
        category: plannedActivity.category,
        label: plannedActivity.label,
        note: plannedActivity.note,
        expected_period: plannedActivity.expected_period,
        expected_time: plannedActivity.expected_time,
        planned_for: body.planned_for,
        repeat_rule: plannedActivity.repeat_rule ?? 'none',
        series_id: plannedActivity.series_id,
        moved_from_id: plannedActivity.id,
        source: plannedActivity.source,
      })
      .select()
      .single()
    if (error || !moved) return NextResponse.json({ error: error?.message ?? 'Move failed' }, { status: 500 })
    const { data: skipped } = await supabase
      .from('planned_activities')
      .update({ status: 'skipped', updated_at: new Date().toISOString() })
      .eq('id', plannedActivity.id)
      .select()
      .single()
    return NextResponse.json({ plannedActivity: skipped, movedActivity: moved, activity: null })
  }

  if (body.action === 'update') {
    if (plannedActivity.status === 'confirmed') {
      return NextResponse.json({ error: 'Completed tasks cannot be edited.' }, { status: 400 })
    }
    const expectedTime = body.expected_time && /^\d{2}:\d{2}$/.test(body.expected_time) ? body.expected_time : null
    const repeatRule = REPEAT_RULES.has(body.repeat_rule as RepeatRule)
      ? body.repeat_rule as RepeatRule
      : plannedActivity.repeat_rule ?? 'none'
    const updateValues = {
      note: body.note?.trim().slice(0, 160) || plannedActivity.note,
      expected_period: expectedTime ? periodForTime(expectedTime) : body.expected_period ?? plannedActivity.expected_period,
      expected_time: expectedTime,
      repeat_rule: repeatRule,
      series_id: repeatRule === 'none' ? null : plannedActivity.series_id ?? plannedActivity.id,
      updated_at: new Date().toISOString(),
    }
    let updateQuery = supabase
      .from('planned_activities')
      .update(updateValues)
      .eq('household_id', profile.household_id)
    updateQuery = body.series_scope === 'future' && plannedActivity.series_id
      ? updateQuery.eq('series_id', plannedActivity.series_id).gte('planned_for', plannedActivity.planned_for)
      : updateQuery.eq('id', plannedActivity.id)
    const { data: updatedRows, error } = await updateQuery
      .select()
    const updated = updatedRows?.find(item => item.id === plannedActivity.id) ?? updatedRows?.[0]
    if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
    await ensureNextOccurrence(supabase, updated as PlannedActivity)
    return NextResponse.json({ plannedActivity: updated, activity: null })
  }

  if (body.action === 'reopen') {
    const confirmedActivityLogId = plannedActivity.confirmed_activity_log_id
    const { data: updated, error } = await supabase
      .from('planned_activities')
      .update({
        status: 'planned',
        confirmed_activity_log_id: null,
        confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plannedActivity.id)
      .select()
      .single()

    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? 'Reopen failed' }, { status: 500 })
    }

    if (confirmedActivityLogId) {
      await supabase
        .from('activity_logs')
        .delete()
        .eq('id', confirmedActivityLogId)
        .eq('household_id', profile.household_id)
    }

    await trackEvent(supabase, {
      eventName: 'planned_activity_reopened',
      profile,
      userId: user.id,
      properties: {
        planned_activity_id: plannedActivity.id,
        deleted_activity_id: confirmedActivityLogId,
      },
    })

    return NextResponse.json({ plannedActivity: updated, activity: null, deleted_activity_id: confirmedActivityLogId })
  }

  if (body.action !== 'confirm') {
    const { data: updated, error } = await supabase
      .from('planned_activities')
      .update({
        status: body.action,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plannedActivity.id)
      .select()
      .single()

    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
    }

    await trackEvent(supabase, {
      eventName: `planned_activity_${body.action}`,
      profile,
      userId: user.id,
      properties: {
        planned_activity_id: plannedActivity.id,
        category: plannedActivity.category,
      },
    })

    return NextResponse.json({ plannedActivity: updated, activity: null })
  }

  if (plannedActivity.status === 'confirmed') {
    const { data: existingActivity } = plannedActivity.confirmed_activity_log_id
      ? await supabase
        .from('activity_logs')
        .select('*')
        .eq('id', plannedActivity.confirmed_activity_log_id)
        .maybeSingle()
      : { data: null }

    return NextResponse.json({ plannedActivity, activity: existingActivity })
  }

  const confirmedAt = new Date().toISOString()
  const { data: claimedPlan, error: claimError } = await supabase
    .from('planned_activities')
    .update({
      status: 'confirmed',
      confirmed_at: confirmedAt,
      updated_at: confirmedAt,
    })
    .eq('id', plannedActivity.id)
    .eq('household_id', profile.household_id)
    .in('status', ['planned', 'not_now'])
    .select()
    .maybeSingle()

  if (claimError) {
    return NextResponse.json({ error: claimError.message ?? 'Confirmation failed' }, { status: 500 })
  }

  if (!claimedPlan) {
    const { data: currentPlan } = await supabase
      .from('planned_activities')
      .select('*')
      .eq('id', plannedActivity.id)
      .single()
    const { data: existingActivity } = currentPlan?.confirmed_activity_log_id
      ? await supabase
        .from('activity_logs')
        .select('*')
        .eq('id', currentPlan.confirmed_activity_log_id)
        .maybeSingle()
      : { data: null }

    return NextResponse.json({ plannedActivity: currentPlan, activity: existingActivity })
  }

  const { data: activity, error: activityError } = await supabase
    .from('activity_logs')
    .insert({
      household_id: profile.household_id,
      logged_by: profile.id,
      category: plannedActivity.category,
      label: plannedActivity.label,
      note: plannedActivity.note,
      occurred_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (activityError || !activity) {
    await supabase
      .from('planned_activities')
      .update({
        status: plannedActivity.status,
        confirmed_at: plannedActivity.confirmed_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plannedActivity.id)
      .eq('household_id', profile.household_id)
      .is('confirmed_activity_log_id', null)
    return NextResponse.json({ error: activityError?.message ?? 'Activity log failed' }, { status: 500 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('planned_activities')
    .update({
      status: 'confirmed',
      confirmed_activity_log_id: activity.id,
      confirmed_at: confirmedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plannedActivity.id)
    .eq('household_id', profile.household_id)
    .is('confirmed_activity_log_id', null)
    .select()
    .single()

  if (updateError || !updated) {
    await supabase.from('activity_logs').delete().eq('id', activity.id)
    return NextResponse.json({ error: updateError?.message ?? 'Confirmation update failed' }, { status: 500 })
  }

  await ensureNextOccurrence(supabase, updated as PlannedActivity)

  await trackEvent(supabase, {
    eventName: 'planned_activity_confirmed',
    profile,
    userId: user.id,
    properties: {
      planned_activity_id: plannedActivity.id,
      activity_id: activity.id,
      category: activity.category,
      expected_period: plannedActivity.expected_period,
    },
  })

  return NextResponse.json({ plannedActivity: updated, activity })
}
