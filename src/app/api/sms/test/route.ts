import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase-server'
import { ACTIVITY_TILES } from '@/types'
import { getLocalDateKey } from '@/lib/dates'
import { getHouseholdMembers } from '@/lib/household-links'
import { trackEvent } from '@/lib/analytics'
import {
  APP_URL,
  buildCarePartnerNoResponse,
  buildMorningFollowup,
  buildMorningPrompt,
  logSmsMessage,
} from '@/lib/sms'
import { buildPendingPlanReminderMessage, sendSMS } from '@/lib/twilio'

type TestAction = 'morning_prompt' | 'morning_followup' | 'pending_reminder' | 'care_partner_no_response'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await request.json().catch(() => ({})) as { action?: TestAction }
  if (!action) return NextResponse.json({ error: 'Missing test action' }, { status: 400 })

  const { data: careProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!careProfile || careProfile.role !== 'care_partner' || !careProfile.household_id) {
    return NextResponse.json({ error: 'Only a linked care partner can run SMS tests' }, { status: 403 })
  }

  const service = createServiceClient()
  const household = await getHouseholdMembers(supabase, careProfile.household_id, careProfile.id)
  const mciProfile = household.mciProfile

  if (!mciProfile) {
    return NextResponse.json({ error: 'No MCI household member is linked yet' }, { status: 400 })
  }

  if (action === 'care_partner_no_response') {
    if (!careProfile.phone_e164) return NextResponse.json({ error: 'Care partner needs a phone number first' }, { status: 400 })

    const body = buildCarePartnerNoResponse(mciProfile.display_name)
    const { sid, status, error } = await sendSMS(careProfile.phone_e164, body)
    await logSmsMessage(service, {
      householdId: careProfile.household_id,
      profileId: careProfile.id,
      direction: 'outbound',
      purpose: 'care_partner_no_response',
      phoneE164: careProfile.phone_e164,
      body,
      twilioSid: sid,
      status,
      metadata: { test: true, mci_profile_id: mciProfile.id },
    })

    await trackEvent(service, {
      eventName: 'sms_test_sent',
      profile: careProfile,
      userId: careProfile.user_id,
      properties: { action, status, sid, error },
    })

    return NextResponse.json({ sent: Boolean(sid), status, error, body })
  }

  if (!mciProfile.phone_e164) {
    return NextResponse.json({ error: `${mciProfile.display_name} needs a phone number before MCI SMS tests can send` }, { status: 400 })
  }

  let body = ''
  let purpose: 'morning_prompt' | 'morning_followup' | 'pending_reminder' = 'morning_prompt'

  if (action === 'morning_prompt') {
    body = buildMorningPrompt(mciProfile.display_name)
    purpose = 'morning_prompt'
  }

  if (action === 'morning_followup') {
    body = buildMorningFollowup(mciProfile.display_name)
    purpose = 'morning_followup'
  }

  if (action === 'pending_reminder') {
    const todayKey = getLocalDateKey(new Date(), mciProfile.timezone)
    const { data: pendingItems } = await service
      .from('planned_activities')
      .select('*')
      .eq('household_id', careProfile.household_id)
      .eq('planned_for', todayKey)
      .in('status', ['planned', 'not_now'])
      .order('created_at', { ascending: true })
      .limit(5)

    if (!pendingItems || pendingItems.length === 0) {
      return NextResponse.json({ error: 'No pending planned activities to remind about yet' }, { status: 400 })
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

    body = buildPendingPlanReminderMessage(mciProfile.display_name, pendingForSms, APP_URL)
    purpose = 'pending_reminder'
  }

  const { sid, status, error } = await sendSMS(mciProfile.phone_e164, body)
  await logSmsMessage(service, {
    householdId: careProfile.household_id,
    profileId: mciProfile.id,
    direction: 'outbound',
    purpose,
    phoneE164: mciProfile.phone_e164,
    body,
    twilioSid: sid,
    status,
    metadata: { test: true },
  })

  await trackEvent(service, {
    eventName: 'sms_test_sent',
    profile: careProfile,
    userId: careProfile.user_id,
    properties: { action, status, sid, error },
  })

  return NextResponse.json({ sent: Boolean(sid), status, error, body })
}
