import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS, buildPendingPlanReminderMessage } from '@/lib/twilio'
import { ACTIVITY_TILES } from '@/types'
import { trackEvent } from '@/lib/analytics'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { getMciProfilesForSms } from '@/lib/household-links'
import { APP_URL, logSmsMessage } from '@/lib/sms'
import { ensureRepeatOccurrencesForDate } from '@/lib/task-scheduling-server'

const CRON_SECRET = process.env.CRON_SECRET

function reminderSlot(pathname: string) {
  if (pathname.includes('/noon')) return 'noon'
  if (pathname.includes('/afternoon')) return 'afternoon'
  return 'gap'
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

  let mciProfiles
  try {
    mciProfiles = await getMciProfilesForSms(supabase)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown profile lookup error'
    console.error(`[Cron reminder:${slot}] Profile lookup failed:`, message)
    return NextResponse.json({
      error: 'profile_lookup_failed',
      ...(force ? { details: message } : {}),
    }, { status: 500 })
  }

  if (mciProfiles.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, slot, force, results: [] })
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
