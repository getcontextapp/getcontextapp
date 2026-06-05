import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { trackEvent } from '@/lib/analytics'
import type { CreatePlannedActivityPayload } from '@/types'

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

  const { data: plannedActivity, error } = await supabase
    .from('planned_activities')
    .insert({
      household_id: profile.household_id,
      created_by: profile.id,
      assigned_to: profile.id,
      category: body.category,
      label: body.label,
      note: body.note?.trim() || null,
      expected_period: body.expected_period,
      expected_time: body.expected_time ?? null,
      planned_for: body.planned_for,
      source: 'manual',
    })
    .select()
    .single()

  if (error || !plannedActivity) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
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

  const body: { id?: string; action?: 'confirm' | 'not_now' | 'skipped' | 'reopen' | 'delete' } = await request.json()
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
    const confirmedActivityLogId = plannedActivity.confirmed_activity_log_id
    const { error } = await supabase
      .from('planned_activities')
      .delete()
      .eq('id', plannedActivity.id)
      .eq('household_id', profile.household_id)

    if (error) {
      return NextResponse.json({ error: error.message ?? 'Delete failed' }, { status: 500 })
    }

    if (confirmedActivityLogId) {
      await supabase
        .from('activity_logs')
        .delete()
        .eq('id', confirmedActivityLogId)
        .eq('household_id', profile.household_id)
    }

    await trackEvent(supabase, {
      eventName: 'planned_activity_deleted',
      profile,
      userId: user.id,
      properties: {
        planned_activity_id: plannedActivity.id,
        deleted_activity_id: confirmedActivityLogId,
        category: plannedActivity.category,
        previous_status: plannedActivity.status,
      },
    })

    return NextResponse.json({
      plannedActivity: null,
      activity: null,
      deleted_planned_activity_id: plannedActivity.id,
      deleted_activity_id: confirmedActivityLogId,
    })
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
    return NextResponse.json({ error: activityError?.message ?? 'Activity log failed' }, { status: 500 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('planned_activities')
    .update({
      status: 'confirmed',
      confirmed_activity_log_id: activity.id,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', plannedActivity.id)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Confirmation update failed' }, { status: 500 })
  }

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
