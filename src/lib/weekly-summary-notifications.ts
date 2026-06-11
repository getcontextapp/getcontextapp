import type { SupabaseClient } from '@supabase/supabase-js'
import { getLinkedMciProfile } from '@/lib/household-links'
import { APP_URL, logSmsMessage } from '@/lib/sms'
import { sendSMS, buildCarePartnerWeeklySummaryMessage, buildPersonalWeeklySummaryMessage } from '@/lib/twilio'
import { loadWeeklySummary } from '@/lib/weekly-summary-server'
import type { Profile } from '@/types'

const WEEKLY_SEND_HOUR = 10

function getLocalScheduleParts(profile: Profile, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: profile.timezone || undefined,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now)
  return {
    weekday: parts.find(part => part.type === 'weekday')?.value,
    hour: Number(parts.find(part => part.type === 'hour')?.value),
  }
}

export async function runWeeklySummaryNotifications(
  supabase: SupabaseClient,
  now = new Date(),
) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)
    .order('created_at', { ascending: true })

  const profiles = (data ?? []) as Profile[]
  let sent = 0

  for (const profile of profiles) {
    const schedule = getLocalScheduleParts(profile, now)
    if (schedule.weekday !== 'Sun' || schedule.hour !== WEEKLY_SEND_HOUR) continue

    const mciProfile = profile.role === 'mci_user'
      ? profile
      : await getLinkedMciProfile(supabase, profile.household_id, profile.id)
    if (!mciProfile || !profile.phone_e164 || !profile.household_id) continue

    const summary = await loadWeeklySummary(supabase, mciProfile, now)
    const { data: existing } = await supabase
      .from('sms_messages')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('purpose', 'weekly_summary')
      .contains('metadata', { week_end: summary.endKey })
      .limit(1)
      .maybeSingle()
    if (existing) continue

    const body = profile.role === 'care_partner'
      ? buildCarePartnerWeeklySummaryMessage(
          summary.dateLabel,
          summary.completed,
          summary.totalPlanned,
          APP_URL,
        )
      : buildPersonalWeeklySummaryMessage(
          summary.dateLabel,
          summary.completed,
          summary.totalPlanned,
          APP_URL,
        )
    const result = await sendSMS(profile.phone_e164, body)

    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'weekly_summary',
      phoneE164: profile.phone_e164,
      body,
      twilioSid: result.sid,
      status: result.status,
      metadata: {
        week_start: summary.startKey,
        week_end: summary.endKey,
        completed: summary.completed,
        total_planned: summary.totalPlanned,
        recipient_role: profile.role,
      },
    })
    sent++
  }

  return { sent }
}
