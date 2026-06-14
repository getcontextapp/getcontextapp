import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/twilio'
import { buildCarePartnerNoResponse, buildMorningFollowup, logSmsMessage } from '@/lib/sms'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { getCarePartnersForHousehold, getMciProfilesForSms } from '@/lib/household-links'
import { trackEvent } from '@/lib/analytics'
import { shouldSendCarePartnerAlert, shouldSendMorningFollowup } from '@/lib/sms-followup'
import type { SmsReadyProfile } from '@/lib/household-links'
import type { Profile } from '@/types'

const CRON_SECRET = process.env.CRON_SECRET

function localHour(profile: Pick<Profile, 'timezone'>) {
  return Number(new Date().toLocaleString('en-US', {
    timeZone: profile.timezone || undefined,
    hour: 'numeric',
    hour12: false,
  }))
}

async function hasMorningEngagement(
  supabase: ReturnType<typeof createServiceClient>,
  profile: SmsReadyProfile,
) {
  const range = getUtcRangeForLocalDay(new Date(), profile.timezone)
  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const [inboundResult, planResult, activityResult] = await Promise.all([
    supabase
      .from('sms_messages')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('direction', 'inbound')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('planned_activities')
      .select('id')
      .eq('household_id', profile.household_id)
      .eq('planned_for', todayKey)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('activity_logs')
      .select('id')
      .eq('household_id', profile.household_id)
      .gte('occurred_at', range.start)
      .lt('occurred_at', range.end)
      .limit(1)
      .maybeSingle(),
  ])

  const lookupError = inboundResult.error || planResult.error || activityResult.error
  if (lookupError) {
    console.error('[Morning follow-up] Engagement lookup failed:', lookupError.message)
    return true
  }

  return Boolean(inboundResult.data || planResult.data || activityResult.data)
}

async function hasPurposeToday(
  supabase: ReturnType<typeof createServiceClient>,
  profile: Profile,
  purpose: string,
) {
  const range = getUtcRangeForLocalDay(new Date(), profile.timezone)
  const { data: message, error } = await supabase
    .from('sms_messages')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('purpose', purpose)
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[Morning follow-up] Duplicate lookup failed:', error.message)
    return true
  }

  return Boolean(message)
}

async function hasCarePartnerAlertToday(
  supabase: ReturnType<typeof createServiceClient>,
  carePartner: Profile,
  mciProfileId: string,
) {
  const range = getUtcRangeForLocalDay(new Date(), carePartner.timezone)
  const { data: message, error } = await supabase
    .from('sms_messages')
    .select('id')
    .eq('profile_id', carePartner.id)
    .eq('direction', 'outbound')
    .eq('purpose', 'care_partner_no_response')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .contains('metadata', { mci_profile_id: mciProfileId })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[Morning follow-up] Care-partner alert lookup failed:', error.message)
    return true
  }

  return Boolean(message)
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const profiles = await getMciProfilesForSms(supabase)

  if (profiles.length === 0) return NextResponse.json({ processed: 0, mciFollowups: 0, careAlerts: 0 })

  let mciFollowups = 0
  let careAlerts = 0

  for (const profile of profiles) {
    const hour = localHour(profile)
    const engaged = await hasMorningEngagement(supabase, profile)
    if (engaged) continue

    const morningFollowupSent = await hasPurposeToday(supabase, profile, 'morning_followup')
    if (shouldSendMorningFollowup(hour, engaged, morningFollowupSent)) {
      const body = buildMorningFollowup(profile.display_name)
      const { sid, status } = await sendSMS(profile.phone_e164, body)
      await logSmsMessage(supabase, {
        householdId: profile.household_id,
        profileId: profile.id,
        direction: 'outbound',
        purpose: 'morning_followup',
        phoneE164: profile.phone_e164,
        body,
        twilioSid: sid,
        status,
      })

      await trackEvent(supabase, {
        eventName: 'morning_followup_sms_attempted',
        profile,
        userId: profile.user_id,
        properties: { status, sid },
      })

      mciFollowups++
    }

    if (hour >= 12) {
      const carePartners = await getCarePartnersForHousehold(supabase, profile.household_id)

      for (const carePartner of carePartners) {
        if (!carePartner.phone_e164) continue
        const alertSent = await hasCarePartnerAlertToday(supabase, carePartner, profile.id)
        if (!shouldSendCarePartnerAlert(hour, engaged, alertSent)) continue
        const body = buildCarePartnerNoResponse(profile.display_name)
        const { sid, status } = await sendSMS(carePartner.phone_e164, body)
        await logSmsMessage(supabase, {
          householdId: profile.household_id,
          profileId: carePartner.id,
          direction: 'outbound',
          purpose: 'care_partner_no_response',
          phoneE164: carePartner.phone_e164,
          body,
          twilioSid: sid,
          status,
          metadata: { mci_profile_id: profile.id },
        })

        await trackEvent(supabase, {
          eventName: 'care_partner_no_response_sms_attempted',
          profile: carePartner,
          userId: carePartner.user_id,
          properties: { status, sid, mci_profile_id: profile.id },
        })

        careAlerts++
      }
    }
  }

  return NextResponse.json({ processed: profiles.length, mciFollowups, careAlerts })
}
