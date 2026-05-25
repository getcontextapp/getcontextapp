import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/twilio'
import { buildMorningPrompt, logSmsMessage } from '@/lib/sms'
import { getLocalDateKey } from '@/lib/dates'
import { trackEvent } from '@/lib/analytics'

const CRON_SECRET = process.env.CRON_SECRET

function localHour(profile: any) {
  return Number(new Date().toLocaleString('en-US', {
    timeZone: profile.timezone || undefined,
    hour: 'numeric',
    hour12: false,
  }))
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'mci_user')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)

  if (!profiles) return NextResponse.json({ processed: 0, sent: 0 })

  let sent = 0

  for (const profile of profiles) {
    if (localHour(profile) !== 8) continue

    const todayKey = getLocalDateKey(new Date(), profile.timezone)
    const startOfToday = `${todayKey}T00:00:00`

    const { data: alreadySent } = await supabase
      .from('sms_messages')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('purpose', 'morning_prompt')
      .gte('created_at', startOfToday)
      .limit(1)
      .maybeSingle()

    if (alreadySent) continue

    const body = buildMorningPrompt(profile.display_name)
    const { sid, status } = await sendSMS(profile.phone_e164, body)

    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'morning_prompt',
      phoneE164: profile.phone_e164,
      body,
      twilioSid: sid,
      status,
    })

    await trackEvent(supabase, {
      eventName: 'morning_plan_sms_attempted',
      profile,
      userId: profile.user_id,
      properties: { status, sid },
    })

    sent++
  }

  return NextResponse.json({ processed: profiles.length, sent })
}

