import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { getMciProfilesForSms } from '@/lib/household-links'
import { logSmsMessage } from '@/lib/sms'
import { sendSMS } from '@/lib/twilio'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  if (CRON_SECRET && request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createServiceClient()
  const profiles = await getMciProfilesForSms(supabase)
  let sent = 0
  for (const profile of profiles) {
    const hour = Number(new Date().toLocaleString('en-US', { timeZone: profile.timezone, hour: 'numeric', hour12: false }))
    if (hour !== 20 || !profile.phone_e164) continue
    const todayKey = getLocalDateKey(new Date(), profile.timezone)
    const { data: items, error: itemError } = await supabase.from('planned_activities').select('*')
      .eq('household_id', profile.household_id).eq('planned_for', todayKey)
      .in('status', ['planned', 'not_now']).order('created_at').limit(8)
    if (itemError) {
      console.error('[Carry over] Waiting task lookup failed:', itemError.message)
      continue
    }
    if (!items?.length) continue
    const range = getUtcRangeForLocalDay(new Date(), profile.timezone)
    const { data: existing, error: existingError } = await supabase.from('sms_messages').select('id')
      .eq('profile_id', profile.id).eq('purpose', 'carry_over')
      .gte('created_at', range.start).lt('created_at', range.end).limit(1).maybeSingle()
    if (existingError) {
      console.error('[Carry over] Duplicate check failed:', existingError.message)
      continue
    }
    if (existing) continue
    const body = [
      'A few tasks are still waiting today:',
      ...items.map((item, index) => `${index + 1}. ${item.note || item.label}`),
      '',
      'To move any to tomorrow, reply MOVE and the numbers, for example: MOVE 1, 3.',
      'No reply means nothing moves.',
    ].join('\n')
    const result = await sendSMS(profile.phone_e164, body)
    await logSmsMessage(supabase, {
      householdId: profile.household_id, profileId: profile.id, direction: 'outbound',
      purpose: 'carry_over', phoneE164: profile.phone_e164, body,
      twilioSid: result.sid, status: result.status,
      metadata: { prompt_item_ids: items.map(item => item.id), planned_for: todayKey },
    })
    sent++
  }
  return NextResponse.json({ sent })
}
