import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/twilio'
import { buildMorningPrompt, logSmsMessage } from '@/lib/sms'
import { getUtcRangeForLocalDay } from '@/lib/dates'
import { getMciProfilesForSms } from '@/lib/household-links'
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

  const force = request.nextUrl.searchParams.get('force') === '1'
  const supabase = createServiceClient()
  const profiles = await getMciProfilesForSms(supabase)

  if (profiles.length === 0) {
    console.info('[Cron morning-plan]', { processed: 0, sent: 0, reason: 'no_sms_ready_profiles' })
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, results: [] })
  }

  let sent = 0
  let failed = 0
  const results: Array<Record<string, unknown>> = []

  for (const profile of profiles) {
    const hour = localHour(profile)
    if (!force && hour !== 8) {
      results.push({
        profile_id: profile.id,
        timezone: profile.timezone,
        local_hour: hour,
        outcome: 'skipped_wrong_local_hour',
      })
      continue
    }

    const todayRange = getUtcRangeForLocalDay(new Date(), profile.timezone)

    const { data: alreadySent } = force
      ? { data: null }
      : await supabase
          .from('sms_messages')
          .select('id')
          .eq('profile_id', profile.id)
          .eq('purpose', 'morning_prompt')
          .eq('direction', 'outbound')
          .neq('status', 'failed')
          .contains('metadata', { scheduled: true })
          .gte('created_at', todayRange.start)
          .lt('created_at', todayRange.end)
          .limit(1)
          .maybeSingle()

    if (alreadySent) {
      results.push({
        profile_id: profile.id,
        timezone: profile.timezone,
        local_hour: hour,
        outcome: 'skipped_already_sent',
      })
      continue
    }

    const body = buildMorningPrompt(profile.display_name)
    const { sid, status, error } = await sendSMS(profile.phone_e164, body)

    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'morning_prompt',
      phoneE164: profile.phone_e164,
      body,
      twilioSid: sid,
      status,
      metadata: {
        scheduled: !force,
        scheduler_test: force,
        cron: 'morning_plan',
        error,
      },
    })

    await trackEvent(supabase, {
      eventName: 'morning_plan_sms_attempted',
      profile,
      userId: profile.user_id,
      properties: {
        status,
        sid,
        error,
        timezone: profile.timezone,
        local_hour: hour,
        scheduled: !force,
        scheduler_test: force,
      },
    })

    if (sid && status !== 'failed') {
      sent++
      results.push({
        profile_id: profile.id,
        timezone: profile.timezone,
        local_hour: hour,
        outcome: 'sent',
        status,
        sid,
      })
    } else {
      failed++
      results.push({
        profile_id: profile.id,
        timezone: profile.timezone,
        local_hour: hour,
        outcome: 'twilio_failed',
        status,
        error,
      })
    }
  }

  const response = { processed: profiles.length, sent, failed, force, results }
  console.info('[Cron morning-plan]', response)
  return NextResponse.json(response)
}
