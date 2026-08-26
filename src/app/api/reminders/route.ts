import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS, buildContextRankNudgeMessage, buildPendingPlanReminderMessage } from '@/lib/twilio'
import { ACTIVITY_TILES, type PlannedActivity, type Profile } from '@/types'
import { trackEvent } from '@/lib/analytics'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { getMciProfilesForSms } from '@/lib/household-links'
import { APP_URL, logSmsMessage } from '@/lib/sms'
import { ensureRepeatOccurrencesForDate } from '@/lib/task-scheduling-server'
import { buildContextRankInput } from '@/lib/context-rank-adapter'
import { runContextRank } from '@/lib/context-rank'
import {
  chooseRankedNudge,
  rankedNudgeAllowsLegacySmsFallback,
  rankedNudgeCopy,
  rankedNudgeSafety,
} from '@/lib/context-rank-nudges'
import { sendPushNotification } from '@/lib/push-notifications'

const CRON_SECRET = process.env.CRON_SECRET

function reminderSlot(pathname: string) {
  if (pathname.includes('/noon')) return 'noon'
  if (pathname.includes('/afternoon')) return 'afternoon'
  return 'gap'
}

type RankedNudgePreference = {
  push_enabled: boolean
  sms_enabled: boolean
  detailed_content: boolean
  categories: Record<string, boolean> | null
}

type ReminderProfile = Profile & { household_id: string }

type RankedNudgeResult = {
  sent: number
  failed: number
  outcome: string
  allowLegacySmsFallback?: boolean
  error?: string
  task_id?: string
  channels?: string[]
  score?: number
  confidence?: number
}

async function sendRankedNudge(
  supabase: SupabaseClient,
  profile: ReminderProfile,
  slot: 'noon' | 'afternoon',
  now: Date,
): Promise<RankedNudgeResult> {
  const todayKey = getLocalDateKey(now, profile.timezone)
  const dayStart = getUtcRangeForLocalDay(now, profile.timezone).start
  const recentDueSince = new Date(now.getTime() - 45 * 60 * 1000).toISOString()
  const [{ data: preferenceRow, error: preferenceError }, { data: nudgeRows, error: nudgeError }, { data: recentDue, error: dueError }] = await Promise.all([
    supabase.from('notification_preferences')
      .select('push_enabled,sms_enabled,detailed_content,categories')
      .eq('profile_id', profile.id)
      .maybeSingle(),
    supabase.from('notification_events')
      .select('id,sent_at')
      .eq('profile_id', profile.id)
      .eq('category', 'reentry')
      .gte('sent_at', dayStart)
      .order('sent_at', { ascending: false })
      .limit(2),
    supabase.from('notification_events')
      .select('id,sent_at')
      .eq('profile_id', profile.id)
      .eq('category', 'due')
      .gte('sent_at', recentDueSince)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const lookupError = preferenceError || nudgeError || dueError
  if (lookupError) return { sent: 0, failed: 1, outcome: 'notification_lookup_failed', error: lookupError.message }

  const preference = preferenceRow as RankedNudgePreference | null
  if (preference?.categories?.reentry === false) {
    return { sent: 0, failed: 0, outcome: 'disabled_personalized_checkins' }
  }
  const pushEnabled = preference?.push_enabled ?? false
  const smsEnabled = preference?.sms_enabled ?? true
  const hasSms = Boolean(smsEnabled && profile.phone_e164)
  if (!pushEnabled && !hasSms) return { sent: 0, failed: 0, outcome: 'no_enabled_channel' }

  const safety = rankedNudgeSafety({
    sentToday: nudgeRows?.length ?? 0,
    latestNudgeAt: nudgeRows?.[0]?.sent_at,
    recentDueAt: recentDue?.sent_at,
    nowMs: now.getTime(),
  })
  if (safety !== 'send') return { sent: 0, failed: 0, outcome: `skipped_${safety}` }

  let ranked
  try {
    const input = await buildContextRankInput({
      supabase,
      profile,
      queryTime: now.getTime(),
      intent: 'what_should_i_do_next',
    })
    ranked = runContextRank({
      evidence: input.evidence,
      query: { userId: profile.user_id, queryTime: now.getTime(), intent: 'what_should_i_do_next' },
      session: input.session,
    })
  } catch (error) {
    return {
      sent: 0,
      failed: 1,
      outcome: 'context_rank_failed',
      allowLegacySmsFallback: rankedNudgeAllowsLegacySmsFallback('context_rank_failed', hasSms),
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  if (ranked.card.mode === 'abstain' || ranked.card.candidates.length === 0) {
    return {
      sent: 0,
      failed: 0,
      outcome: 'context_rank_abstained',
      allowLegacySmsFallback: rankedNudgeAllowsLegacySmsFallback('context_rank_abstained', hasSms),
    }
  }

  const { data: taskRows, error: taskError } = await supabase.from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', todayKey)
    .in('status', ['planned', 'not_now'])
  if (taskError) return {
    sent: 0,
    failed: 1,
    outcome: 'ranked_task_lookup_failed',
    allowLegacySmsFallback: rankedNudgeAllowsLegacySmsFallback('ranked_task_lookup_failed', hasSms),
    error: taskError.message,
  }

  const choice = chooseRankedNudge(ranked.card.candidates, (taskRows ?? []) as PlannedActivity[], profile.id)
  if (!choice) return {
    sent: 0,
    failed: 0,
    outcome: 'no_eligible_ranked_task',
    allowLegacySmsFallback: rankedNudgeAllowsLegacySmsFallback('no_eligible_ranked_task', hasSms),
  }

  const dedupeKey = `context-rank-nudge:${todayKey}:${choice.task.id}:${profile.id}`
  const { data: duplicate } = await supabase.from('notification_events').select('id')
    .eq('dedupe_key', dedupeKey).maybeSingle()
  if (duplicate) return { sent: 0, failed: 0, outcome: 'duplicate_ranked_task' }

  const copy = rankedNudgeCopy(choice.detail, preference?.detailed_content ?? false)
  const url = '/mci-user'
  const channels: string[] = []
  let eventId: string | null = null
  let pushStatus: Record<string, unknown> | null = null
  let smsStatus: Record<string, unknown> | null = null
  let sent = 0
  let failed = 0
  const metadata = {
    planned_activity_id: choice.task.id,
    context_rank_episode_id: choice.candidate.episode.id,
    context_rank_score: choice.candidate.score,
    context_rank_confidence: choice.candidate.confidence,
    reminder_slot: slot,
  }

  if (pushEnabled) {
    try {
      const push = await sendPushNotification(supabase, {
        profileId: profile.id,
        userId: profile.user_id,
        householdId: profile.household_id,
        category: 'reentry',
        title: copy.title,
        body: copy.pushBody,
        url,
        dedupeKey,
        metadata,
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

  if (hasSms && profile.phone_e164) {
    const smsBody = buildContextRankNudgeMessage(profile.display_name, choice.detail, APP_URL)
    const sms = await sendSMS(profile.phone_e164, smsBody)
    smsStatus = { sent: Boolean(sms.sid && sms.status !== 'failed'), status: sms.status, error: sms.error }
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'pending_reminder',
      phoneE164: profile.phone_e164,
      body: smsBody,
      twilioSid: sms.sid,
      status: sms.status,
      metadata: { ...metadata, nudge_kind: 'context_rank', dedupe_key: dedupeKey },
    })
    if (sms.sid && sms.status !== 'failed') {
      channels.push('sms')
      sent++
    } else {
      failed++
    }
  }

  if (!eventId && hasSms && profile.phone_e164) {
    const { data: event, error } = await supabase.from('notification_events').insert({
      profile_id: profile.id,
      user_id: profile.user_id,
      household_id: profile.household_id,
      category: 'reentry',
      title: copy.title,
      body: copy.historyBody,
      url,
      dedupe_key: dedupeKey,
      channels,
      delivery_status: { sms: smsStatus },
      metadata,
      sent_at: channels.length ? new Date().toISOString() : null,
    }).select('id').single()
    if (error && error.code !== '23505') failed++
    eventId = event?.id ?? null
  } else if (eventId) {
    await supabase.from('notification_events').update({
      body: copy.historyBody,
      channels,
      delivery_status: { push: pushStatus, sms: smsStatus },
      sent_at: channels.length ? new Date().toISOString() : null,
    }).eq('id', eventId)
  }

  await trackEvent(supabase, {
    eventName: 'context_rank_nudge_attempted',
    profile,
    userId: profile.user_id,
    properties: { ...metadata, channels, sent, failed },
  })

  return {
    sent,
    failed,
    outcome: channels.length ? 'sent_context_rank_nudge' : 'ranked_nudge_delivery_failed',
    task_id: choice.task.id,
    channels,
    score: choice.candidate.score,
    confidence: choice.candidate.confidence,
  }
}

// Called by scheduled reminder touchpoints.
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const slot = reminderSlot(request.nextUrl.pathname)
  const isFixedSlot = slot === 'noon' || slot === 'afternoon'
  const force = request.nextUrl.searchParams.get('force') === '1'
  const forcedProfileId = force ? request.nextUrl.searchParams.get('profile_id') : null

  let smsReadyProfiles
  try {
    smsReadyProfiles = await getMciProfilesForSms(supabase)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown profile lookup error'
    console.error(`[Cron reminder:${slot}] Profile lookup failed:`, message)
    return NextResponse.json({
      error: 'profile_lookup_failed',
      ...(force ? { details: message } : {}),
    }, { status: 500 })
  }

  const { data: pushOnlyRows, error: pushOnlyError } = await supabase.from('profiles')
    .select('*')
    .eq('role', 'mci_user')
    .is('phone_e164', null)
    .not('household_id', 'is', null)
  if (pushOnlyError) return NextResponse.json({ error: pushOnlyError.message }, { status: 500 })
  const candidateProfiles = [...smsReadyProfiles, ...((pushOnlyRows ?? []) as ReminderProfile[])] as ReminderProfile[]
  if (candidateProfiles.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, slot, force, results: [] })
  }

  const householdIds = Array.from(new Set(candidateProfiles.map(profile => profile.household_id)))
  const { data: householdRows, error: householdError } = await supabase.from('households')
    .select('id,name')
    .in('id', householdIds)
  if (householdError) return NextResponse.json({ error: householdError.message }, { status: 500 })
  const participantHouseholdIds = new Set((householdRows ?? []).map(household => household.id))
  let mciProfiles = candidateProfiles.filter(profile => participantHouseholdIds.has(profile.household_id))
  if (forcedProfileId) {
    const forcedProfile = mciProfiles.find(profile => profile.id === forcedProfileId)
    if (!forcedProfile) {
      return NextResponse.json({ error: 'Forced profile must belong to a Context household.' }, { status: 403 })
    }
    mciProfiles = [forcedProfile]
  }

  let sent = 0
  let failed = 0
  const results: Array<Record<string, unknown>> = []

  for (const profile of mciProfiles) {
    const localHour = Number(new Date().toLocaleString('en-US', {
      timeZone: profile.timezone || undefined,
      hour: 'numeric',
      hour12: false,
    }))

    // Keep SMS nudges inside the MVP day window: 8 AM through 8 PM local time.
    if (!force && (localHour < 8 || localHour > 20)) {
      results.push({ profile_id: profile.id, local_hour: localHour, outcome: 'skipped_outside_day_window' })
      continue
    }
    if (!force && slot === 'noon' && localHour !== 12) {
      results.push({ profile_id: profile.id, local_hour: localHour, outcome: 'skipped_wrong_local_hour' })
      continue
    }
    if (!force && slot === 'afternoon' && localHour !== 16) {
      results.push({ profile_id: profile.id, local_hour: localHour, outcome: 'skipped_wrong_local_hour' })
      continue
    }

    if (isFixedSlot) {
      const rankedResult = await sendRankedNudge(
        supabase,
        profile,
        slot as 'noon' | 'afternoon',
        new Date(),
      )
      if (!rankedResult.allowLegacySmsFallback) {
        sent += rankedResult.sent
        failed += rankedResult.failed
        results.push({ profile_id: profile.id, local_hour: localHour, ...rankedResult })
        continue
      }
      results.push({
        profile_id: profile.id,
        local_hour: localHour,
        outcome: 'using_pending_sms_fallback',
        context_rank_outcome: rankedResult.outcome,
      })
    }

    const gapMinutes = profile.reminder_gap_minutes ?? 240
    const gapMs = gapMinutes * 60 * 1000
    const checkFrom = new Date(Date.now() - gapMs).toISOString()
    const todayKey = getLocalDateKey(new Date(), profile.timezone)
    await ensureRepeatOccurrencesForDate(supabase, profile.household_id, todayKey)

    let pendingQuery = supabase
      .from('planned_activities')
      .select('*')
      .eq('household_id', profile.household_id)
      .eq('planned_for', todayKey)
      .in('status', ['planned', 'not_now'])
      .order('created_at', { ascending: true })
      .limit(5)

    // Fixed noon/afternoon nudges should check what is pending at that touchpoint.
    // The gap route still waits until an item has been quiet for the user's reminder gap.
    if (!isFixedSlot) {
      pendingQuery = pendingQuery.lte('updated_at', checkFrom)
    }

    // Only remind when there is at least one planned item waiting for confirmation.
    const { data: pendingItems, error: pendingError } = await pendingQuery

    if (pendingError) {
      failed++
      results.push({ profile_id: profile.id, local_hour: localHour, outcome: 'pending_lookup_failed', error: pendingError.message })
      continue
    }
    if (!pendingItems || pendingItems.length === 0) {
      results.push({ profile_id: profile.id, local_hour: localHour, outcome: 'skipped_no_pending_items' })
      continue
    }

    const duplicateSince = isFixedSlot
      ? getUtcRangeForLocalDay(new Date(), profile.timezone).start
      : checkFrom

    // Check if we already sent this fixed touchpoint today, or this gap reminder recently.
    let recentReminderQuery = supabase
      .from('sms_messages')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('direction', 'outbound')
      .eq('purpose', 'pending_reminder')
      .gte('created_at', duplicateSince)
      .limit(1)

    if (isFixedSlot) {
      recentReminderQuery = recentReminderQuery.contains('metadata', { reminder_slot: slot })
    }

    const { data: recentReminder } = await recentReminderQuery.maybeSingle()

    if (!force && recentReminder) {
      results.push({ profile_id: profile.id, local_hour: localHour, outcome: 'skipped_already_sent' })
      continue
    }

    const pendingForSms = pendingItems.map(item => {
      const tile = ACTIVITY_TILES.find(t => t.category === item.category)
      return {
        icon: tile?.icon ?? '📌',
        label: tile?.label ?? item.label,
        note: item.note,
        expected_period: item.expected_period,
      }
    })

    const smsBody = buildPendingPlanReminderMessage(
      profile.display_name,
      pendingForSms,
      APP_URL,
    )

    // Send SMS
    const { sid, status, error } = await sendSMS(profile.phone_e164!, smsBody)
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'pending_reminder',
      phoneE164: profile.phone_e164!,
      body: smsBody,
      twilioSid: sid,
      status,
      metadata: {
        pending_count: pendingItems.length,
        reminder_slot: slot,
        scheduler_test: force,
        error,
      },
    })

    // Log the reminder
    await supabase.from('reminder_logs').insert({
      household_id: profile.household_id,
      profile_id: profile.id,
      type: 'reentry',
      twilio_sid: sid,
      status,
    })

    await trackEvent(supabase, {
      eventName: 'reentry_sms_attempted',
      profile,
      userId: profile.user_id,
      properties: {
        status,
        sid,
        gap_minutes: gapMinutes,
        pending_count: pendingItems.length,
        reminder_slot: slot,
      },
    })

    if (sid && status !== 'failed') {
      sent++
      results.push({
        profile_id: profile.id,
        local_hour: localHour,
        outcome: 'sent',
        pending_count: pendingItems.length,
        status,
        sid,
      })
    } else {
      failed++
      results.push({
        profile_id: profile.id,
        local_hour: localHour,
        outcome: 'twilio_failed',
        status,
        error,
      })
    }
  }

  const response = { processed: mciProfiles.length, sent, failed, slot, force, results }
  console.info(`[Cron reminder:${slot}]`, response)
  return NextResponse.json(response)
}
