import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { dueReminderCopy, dueReminderDetail, isDueReminderWindow, localDateAndMinute } from '@/lib/due-reminders'
import { sendPushNotification } from '@/lib/push-notifications'
import { APP_URL, logSmsMessage } from '@/lib/sms'
import { buildDueReminderMessage, sendSMS } from '@/lib/twilio'
import { ensureRepeatOccurrencesForDate } from '@/lib/task-scheduling-server'
import { loadCalendarLinkedPlanIds, nudgeRankCalendarDecision } from '@/lib/nudge-rank'

const CRON_SECRET = process.env.CRON_SECRET
const DEFAULT_CATEGORIES = { due: true }

type DueProfile = {
  id: string
  user_id: string
  household_id: string
  role: 'mci_user' | 'care_partner'
  display_name: string
  phone_e164: string | null
  timezone: string | null
}

type DuePreference = {
  profile_id: string
  push_enabled: boolean
  sms_enabled: boolean
  detailed_content: boolean
  categories: Record<string, boolean> | null
}

type DueTask = {
  id: string
  household_id: string
  created_by: string
  assigned_to: string | null
  category: string
  label: string
  note: string | null
  expected_time: string
  planned_for: string
}

function dashboardPath(role: DueProfile['role']) {
  return role === 'care_partner' ? '/care-partner' : '/mci-user'
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Reminder scheduler is not configured.' }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const now = new Date()
  const { data: households, error: householdError } = await service.from('households').select('id')
  if (householdError) return NextResponse.json({ error: householdError.message }, { status: 500 })
  const householdIds = (households ?? []).map(household => household.id)
  if (householdIds.length === 0) return NextResponse.json({ processed: 0, sent: 0, results: [] })

  const { data: profileRows, error: profileError } = await service.from('profiles')
    .select('id,user_id,household_id,role,display_name,phone_e164,timezone')
    .in('household_id', householdIds)
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  const profiles = (profileRows ?? []) as DueProfile[]
  if (profiles.length === 0) return NextResponse.json({ processed: 0, sent: 0, failed: 0, results: [] })
  const localContext = new Map(profiles.map(profile => [profile.id, localDateAndMinute(now, profile.timezone)]))
  const localDates = Array.from(new Set([...localContext.values()].map(context => context.dateKey)))

  for (const householdId of householdIds) {
    for (const dateKey of localDates) await ensureRepeatOccurrencesForDate(service, householdId, dateKey)
  }

  const [{ data: taskRows, error: taskError }, { data: preferenceRows, error: preferenceError }] = await Promise.all([
    service.from('planned_activities')
      .select('id,household_id,created_by,assigned_to,category,label,note,expected_time,planned_for')
      .in('household_id', householdIds)
      .in('planned_for', localDates)
      .eq('status', 'planned')
      .not('expected_time', 'is', null),
    service.from('notification_preferences').select('profile_id,push_enabled,sms_enabled,detailed_content,categories')
      .in('profile_id', profiles.map(profile => profile.id)),
  ])
  const lookupError = taskError || preferenceError
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const tasks = (taskRows ?? []) as DueTask[]
  const calendarLinkedByHousehold = new Map<string, Set<string>>()
  try {
    await Promise.all(householdIds.map(async householdId => {
      calendarLinkedByHousehold.set(householdId, await loadCalendarLinkedPlanIds(service, householdId))
    }))
  } catch (error) {
    return NextResponse.json({
      error: 'nudge_rank_calendar_policy_lookup_failed',
      details: error instanceof Error ? error.message : 'Unknown calendar policy error',
    }, { status: 500 })
  }
  const preferences = new Map((preferenceRows ?? []).map(row => [row.profile_id, row as DuePreference]))
  const profilesByHousehold = new Map<string, DueProfile[]>()
  for (const profile of profiles) {
    const householdProfiles = profilesByHousehold.get(profile.household_id) ?? []
    householdProfiles.push(profile)
    profilesByHousehold.set(profile.household_id, householdProfiles)
  }

  let sent = 0
  let failed = 0
  const results: Array<Record<string, unknown>> = []

  for (const task of tasks) {
    const householdProfiles = profilesByHousehold.get(task.household_id) ?? []
    const assignedProfile = task.assigned_to
      ? householdProfiles.find(profile => profile.id === task.assigned_to)
      : null
    const recipient = assignedProfile ??
      householdProfiles.find(profile => profile.role === 'mci_user') ??
      householdProfiles.find(profile => profile.id === task.created_by)
    if (!recipient) continue

    const timing = localContext.get(recipient.id)
    if (!timing || timing.dateKey !== task.planned_for ||
      !isDueReminderWindow(task.expected_time, timing.minuteOfDay)) continue

    const calendarDecision = nudgeRankCalendarDecision({
      calendarLinked: calendarLinkedByHousehold.get(task.household_id)?.has(task.id) ?? false,
      distinctCognitiveValue: false,
    })
    if (calendarDecision === 'suppress_source_calendar_duplicate') {
      results.push({ task_id: task.id, profile_id: recipient.id, outcome: calendarDecision })
      continue
    }

    const preference = preferences.get(recipient.id)
    const categories = preference?.categories ?? DEFAULT_CATEGORIES
    if (categories.due === false) {
      results.push({ task_id: task.id, profile_id: recipient.id, outcome: 'disabled_due_category' })
      continue
    }

    const pushEnabled = preference?.push_enabled ?? false
    const smsEnabled = preference?.sms_enabled ?? true
    const hasSms = Boolean(smsEnabled && recipient.phone_e164)
    if (!pushEnabled && !hasSms) {
      results.push({ task_id: task.id, profile_id: recipient.id, outcome: 'no_enabled_channel' })
      continue
    }

    const dedupeKey = `due:${task.id}:${recipient.id}`
    const { data: existing } = await service.from('notification_events').select('id')
      .eq('dedupe_key', dedupeKey).maybeSingle()
    if (existing) {
      results.push({ task_id: task.id, profile_id: recipient.id, outcome: 'duplicate' })
      continue
    }

    const detail = dueReminderDetail(task)
    const copy = dueReminderCopy(detail, preference?.detailed_content ?? false)
    const url = dashboardPath(recipient.role)
    let eventId: string | null = null
    let pushStatus: Record<string, unknown> | null = null
    let smsStatus: Record<string, unknown> | null = null
    const channels: string[] = []

    if (pushEnabled) {
      try {
        const push = await sendPushNotification(service, {
          profileId: recipient.id,
          userId: recipient.user_id,
          householdId: recipient.household_id,
          category: 'due',
          title: copy.title,
          body: copy.pushBody,
          url,
          dedupeKey,
          metadata: { planned_activity_id: task.id, expected_time: task.expected_time },
        })
        eventId = 'eventId' in push && typeof push.eventId === 'string' ? push.eventId : null
        pushStatus = push
        if (push.sent > 0) {
          channels.push('push')
          sent++
        }
      } catch (error) {
        failed++
        pushStatus = { error: error instanceof Error ? error.message : 'Push failed' }
      }
    }

    if (hasSms) {
      const smsBody = buildDueReminderMessage(recipient.display_name, detail, APP_URL, recipient.role)
      const sms = await sendSMS(recipient.phone_e164!, smsBody)
      smsStatus = { sent: Boolean(sms.sid && sms.status !== 'failed'), status: sms.status, error: sms.error }
      await logSmsMessage(service, {
        householdId: recipient.household_id,
        profileId: recipient.id,
        direction: 'outbound',
        purpose: 'due_reminder',
        phoneE164: recipient.phone_e164!,
        body: smsBody,
        twilioSid: sms.sid,
        status: sms.status,
        metadata: { planned_activity_id: task.id, expected_time: task.expected_time, dedupe_key: dedupeKey },
      })
      if (sms.sid && sms.status !== 'failed') {
        channels.push('sms')
        sent++
      } else {
        failed++
      }
    }

    if (!eventId && hasSms) {
      const { data: event, error } = await service.from('notification_events').insert({
        profile_id: recipient.id,
        user_id: recipient.user_id,
        household_id: recipient.household_id,
        category: 'due',
        title: copy.title,
        body: copy.pushBody,
        url,
        dedupe_key: dedupeKey,
        channels,
        delivery_status: { sms: smsStatus },
        metadata: { planned_activity_id: task.id, expected_time: task.expected_time },
        sent_at: channels.length ? new Date().toISOString() : null,
      }).select('id').single()
      if (error && error.code !== '23505') failed++
      eventId = event?.id ?? null
    } else if (eventId) {
      await service.from('notification_events').update({
        channels,
        delivery_status: { push: pushStatus, sms: smsStatus },
        sent_at: channels.length ? new Date().toISOString() : null,
      }).eq('id', eventId)
    }

    results.push({
      task_id: task.id,
      profile_id: recipient.id,
      outcome: channels.length ? 'sent' : 'failed',
      channels,
    })
  }

  return NextResponse.json({ processed: tasks.length, sent, failed, results })
}
