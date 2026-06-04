import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/twilio'
import { buildCarePartnerNoResponse, buildMorningFollowup, logSmsMessage } from '@/lib/sms'
import { getLocalDateKey } from '@/lib/dates'
import { getCarePartnersForHousehold, getMciProfilesForSms } from '@/lib/household-links'
import { trackEvent } from '@/lib/analytics'

const CRON_SECRET = process.env.CRON_SECRET

function localHour(profile: any) {
  return Number(new Date().toLocaleString('en-US', {
    timeZone: profile.timezone || undefined,
    hour: 'numeric',
    hour12: false,
  }))
}

function localDayStart(profile: any) {
  return `${getLocalDateKey(new Date(), profile.timezone)}T00:00:00`
}

async function hasMorningReply(supabase: ReturnType<typeof createServiceClient>, profile: any) {
  const { data: inbound } = await supabase
    .from('sms_messages')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('direction', 'inbound')
    .gte('created_at', localDayStart(profile))
    .limit(1)
    .maybeSingle()

  return Boolean(inbound)
}

async function hasPurposeToday(supabase: ReturnType<typeof createServiceClient>, profile: any, purpose: string) {
  const { data: message } = await supabase
    .from('sms_messages')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('purpose', purpose)
    .gte('created_at', localDayStart(profile))
    .limit(1)
    .maybeSingle()

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
    const replied = await hasMorningReply(supabase, profile)
    if (replied) continue

    if (hour >= 10 && hour < 12 && !(await hasPurposeToday(supabase, profile, 'morning_followup'))) {
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

    if (hour >= 12 && !(await hasPurposeToday(supabase, profile, 'care_partner_no_response'))) {
      const carePartners = await getCarePartnersForHousehold(supabase, profile.household_id)

      for (const carePartner of carePartners) {
        if (!carePartner.phone_e164) continue
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
