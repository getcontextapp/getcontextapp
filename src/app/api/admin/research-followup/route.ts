import { NextRequest, NextResponse } from 'next/server'
import { getAnalyticsAdminUser } from '@/lib/admin'
import {
  buildResearchFollowupMessage,
  isResearchFollowupDay,
  researchStudyDay,
} from '@/lib/research-followup'
import { logSmsMessage } from '@/lib/sms'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/twilio'

export async function POST(request: NextRequest) {
  const admin = await getAnalyticsAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const householdId = typeof body.householdId === 'string' ? body.householdId : ''
  const milestoneDay = Number(body.milestoneDay)
  if (!householdId || !Number.isInteger(milestoneDay) || !isResearchFollowupDay(milestoneDay)) {
    return NextResponse.json({ error: 'Choose a valid research follow-up day.' }, { status: 400 })
  }

  const service = createServiceClient()
  const [{ data: household, error: householdError }, { data: carePartner, error: profileError }] = await Promise.all([
    service.from('households').select('id,created_at').eq('id', householdId).maybeSingle(),
    service.from('profiles')
      .select('id,display_name,phone_e164,created_at')
      .eq('household_id', householdId)
      .eq('role', 'care_partner')
      .maybeSingle(),
  ])

  if (householdError) return NextResponse.json({ error: householdError.message }, { status: 500 })
  if (!household) return NextResponse.json({ error: 'Dyad not found.' }, { status: 404 })
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!carePartner) return NextResponse.json({ error: 'This dyad has no care partner.' }, { status: 409 })
  if (!carePartner.phone_e164) return NextResponse.json({ error: 'The care partner has no phone number saved.' }, { status: 409 })

  const onboardingAt = [household.created_at, carePartner.created_at].filter(Boolean).sort()[0]
  const currentStudyDay = researchStudyDay(onboardingAt)
  if (milestoneDay > currentStudyDay) {
    return NextResponse.json({ error: `Day ${milestoneDay} has not been reached yet.` }, { status: 409 })
  }

  const [{ data: preference }, { data: priorMessages, error: priorError }] = await Promise.all([
    service.from('notification_preferences').select('sms_enabled').eq('profile_id', carePartner.id).maybeSingle(),
    service.from('sms_messages')
      .select('id,created_at,metadata,status')
      .eq('household_id', householdId)
      .eq('profile_id', carePartner.id)
      .eq('direction', 'outbound')
      .eq('purpose', 'research_followup')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (preference?.sms_enabled === false) {
    return NextResponse.json({ error: 'SMS is turned off for this care partner.' }, { status: 409 })
  }
  if (priorError) return NextResponse.json({ error: priorError.message }, { status: 500 })
  const duplicate = priorMessages?.find(message => message.status !== 'failed' && Number(message.metadata?.milestone_day) === milestoneDay)
  if (duplicate) {
    return NextResponse.json({ error: `The Day ${milestoneDay} follow-up was already sent.`, sentAt: duplicate.created_at }, { status: 409 })
  }

  const message = buildResearchFollowupMessage(carePartner.display_name, milestoneDay)
  const result = await sendSMS(carePartner.phone_e164, message)
  await logSmsMessage(service, {
    householdId,
    profileId: carePartner.id,
    direction: 'outbound',
    purpose: 'research_followup',
    phoneE164: carePartner.phone_e164,
    body: message,
    twilioSid: result.sid,
    status: result.status,
    metadata: {
      milestone_day: milestoneDay,
      admin_user_id: admin.id,
      research_contact: true,
      automated: false,
    },
  })

  if (result.error) return NextResponse.json({ error: `Text could not be sent: ${result.error}` }, { status: 502 })
  return NextResponse.json({ ok: true, sentAt: new Date().toISOString(), status: result.status })
}
