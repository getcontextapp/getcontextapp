import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS, buildPendingPlanReminderMessage } from '@/lib/twilio'
import { ACTIVITY_TILES } from '@/types'
import { trackEvent } from '@/lib/analytics'
import { getLocalDateKey } from '@/lib/dates'
import { getMciProfilesForSms } from '@/lib/household-links'
import { APP_URL, logSmsMessage } from '@/lib/sms'

const CRON_SECRET = process.env.CRON_SECRET

function reminderSlot(pathname: string) {
  if (pathname.includes('/noon')) return 'noon'
  if (pathname.includes('/afternoon')) return 'afternoon'
  return 'gap'
}

function localDayStart(profile: any) {
  return `${getLocalDateKey(new Date(), profile.timezone)}T00:00:00`
}

// Called by fixed Vercel Cron touchpoints on the Hobby plan.
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const slot = reminderSlot(request.nextUrl.pathname)
  const isFixedSlot = slot === 'noon' || slot === 'afternoon'

  const mciProfiles = await getMciProfilesForSms(supabase)

  if (mciProfiles.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let sent = 0

  for (const profile of mciProfiles) {
    const localHour = Number(new Date().toLocaleString('en-US', {
      timeZone: profile.timezone || undefined,
      hour: 'numeric',
      hour12: false,
    }))

    // Keep SMS nudges inside the MVP day window: 8 AM through 8 PM local time.
    if (localHour < 8 || localHour > 20) continue

    const gapMinutes = profile.reminder_gap_minutes ?? 240
    const gapMs = gapMinutes * 60 * 1000
    const checkFrom = new Date(Date.now() - gapMs).toISOString()
    const todayKey = getLocalDateKey(new Date(), profile.timezone)

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
    const { data: pendingItems } = await pendingQuery

    if (!pendingItems || pendingItems.length === 0) continue

    const reminderType = isFixedSlot ? `reentry_${slot}` : 'reentry'
    const duplicateSince = isFixedSlot ? localDayStart(profile) : checkFrom

    // Check if we already sent this fixed touchpoint today, or this gap reminder recently.
    const { data: recentReminder } = await supabase
      .from('reminder_logs')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('type', reminderType)
      .gte('sent_at', duplicateSince)
      .limit(1)
      .single()

    if (recentReminder) continue

    const pendingForSms = pendingItems.map(item => {
      const tile = ACTIVITY_TILES.find(t => t.category === item.category)
      return {
        icon: tile?.icon ?? '📌',
        label: tile?.label ?? item.label,
        note: item.note,
        expected_period: item.expected_period,
      }
    })

    // Save re-entry card to DB
    await supabase.from('context_cards').insert({
      household_id: profile.household_id,
      type: 'reentry',
      title: "Today's plan",
      body: `You still have ${pendingItems.length} item${pendingItems.length !== 1 ? 's' : ''} waiting in today's plan. You can confirm what happened or leave it for later.`,
      generated_by: 'user',
      is_active: true,
    })

    const smsBody = buildPendingPlanReminderMessage(
      profile.display_name,
      pendingForSms,
      APP_URL,
    )

    // Send SMS
    const { sid, status } = await sendSMS(profile.phone_e164!, smsBody)
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
      },
    })

    // Log the reminder
    await supabase.from('reminder_logs').insert({
      household_id: profile.household_id,
      profile_id: profile.id,
      type: reminderType,
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

    sent++
  }

  return NextResponse.json({ processed: mciProfiles.length, sent, slot })
}
