import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS, buildDailySummaryMessage, buildPersonalDailySummaryMessage } from '@/lib/twilio'
import { ACTIVITY_TILES } from '@/types'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'
import { getLinkedMciProfile } from '@/lib/household-links'
import { APP_URL, logSmsMessage } from '@/lib/sms'

const CRON_SECRET = process.env.CRON_SECRET

function getLocalHour(profile: any) {
  return Number(new Date().toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: profile.timezone || undefined,
  }))
}

function getScheduledSummaryHour(profile: any) {
  const configured = String(profile.daily_summary_time || '20:00')
  const hour = Number(configured.slice(0, 2))
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 20
}

// POST: manual trigger (from care partner UI)
export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  const { data: careProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!careProfile || careProfile.role !== 'care_partner' || !careProfile.phone_e164) {
    return NextResponse.json({ error: 'No phone number on file' }, { status: 400 })
  }

  const result = await sendDailySummary(careProfile.household_id, careProfile, supabase)
  await trackEvent(supabase, {
    eventName: 'daily_summary_test_requested',
    profile: careProfile,
    userId: user.id,
    properties: {
      status: result.status,
      sent: result.sent,
    },
  })
  return NextResponse.json(result)
}

// GET: Vercel cron — runs every hour, checks if any care partner is due
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: careProfiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'care_partner')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)

  if (!careProfiles) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const profile of careProfiles) {
    if (getLocalHour(profile) !== getScheduledSummaryHour(profile)) continue

    // Vercel Hobby can invoke cron anywhere inside the scheduled hour.
    // Send once for the user's local day rather than matching the exact minute.
    const todayRange = getUtcRangeForLocalDay(new Date(), profile.timezone)
    const { data: already } = await supabase
      .from('reminder_logs')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('type', 'daily_summary')
      .gte('sent_at', todayRange.start)
      .lt('sent_at', todayRange.end)
      .limit(1)
      .maybeSingle()

    if (already) continue

    await sendDailySummary(profile.household_id, profile)
    sent++
  }

  return NextResponse.json({ sent })
}

async function sendDailySummary(householdId: string, careProfile: any, profileSupabase = createServiceClient()) {
  const supabase = createServiceClient()

  const mciProfile = await getLinkedMciProfile(profileSupabase, householdId, careProfile.id)

  // Get today's activities
  const todayRange = getUtcRangeForLocalDay(new Date(), careProfile.timezone)
  const { data: activities } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('household_id', householdId)
    .gte('occurred_at', todayRange.start)
    .lt('occurred_at', todayRange.end)
    .order('occurred_at', { ascending: true })
    .limit(20)

  const activityList = (activities ?? []).map(a => {
    const tile = ACTIVITY_TILES.find(t => t.category === a.category)
    return { icon: tile?.icon ?? '📌', label: a.note || a.label, occurred_at: a.occurred_at }
  })

  const { data: pendingItems } = await supabase
    .from('planned_activities')
    .select('id')
    .eq('household_id', householdId)
    .eq('planned_for', getLocalDateKey(new Date(), careProfile.timezone))
    .in('status', ['planned', 'not_now'])

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const smsBody = buildDailySummaryMessage(
    careProfile.display_name,
    mciProfile?.display_name ?? 'your household member',
    dateStr,
    activityList,
    APP_URL,
  )

  const { sid, status } = await sendSMS(careProfile.phone_e164, smsBody)
  await logSmsMessage(supabase, {
    householdId,
    profileId: careProfile.id,
    direction: 'outbound',
    purpose: 'daily_summary',
    phoneE164: careProfile.phone_e164,
    body: smsBody,
    twilioSid: sid,
    status,
    metadata: {
      activity_count: activityList.length,
      pending_count: pendingItems?.length ?? 0,
      recipient_role: 'care_partner',
    },
  })

  await supabase.from('reminder_logs').insert({
    household_id: householdId,
    profile_id: careProfile.id,
    type: 'daily_summary',
    twilio_sid: sid,
    status,
  })

  await trackEvent(supabase, {
    eventName: 'daily_summary_sms_attempted',
    profile: careProfile,
    userId: careProfile.user_id,
    properties: {
      status,
      sid,
      activity_count: activityList.length,
    },
  })

  let mciStatus: string | null = null
  if (mciProfile?.phone_e164) {
    const mciBody = buildPersonalDailySummaryMessage(
      mciProfile.display_name,
      dateStr,
      activityList,
      pendingItems?.length ?? 0,
      APP_URL,
    )
    const mciResult = await sendSMS(mciProfile.phone_e164, mciBody)
    mciStatus = mciResult.status

    await logSmsMessage(supabase, {
      householdId,
      profileId: mciProfile.id,
      direction: 'outbound',
      purpose: 'daily_summary',
      phoneE164: mciProfile.phone_e164,
      body: mciBody,
      twilioSid: mciResult.sid,
      status: mciResult.status,
      metadata: {
        activity_count: activityList.length,
        pending_count: pendingItems?.length ?? 0,
        recipient_role: 'mci_user',
      },
    })
  }

  return { sent: true, status, mciStatus }
}
