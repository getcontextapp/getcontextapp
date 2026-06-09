import { createServiceClient } from '@/lib/supabase-server'
import { buildWelcomeMessage, logSmsMessage } from '@/lib/sms'
import { sendSMS } from '@/lib/twilio'
import { trackEvent } from '@/lib/analytics'
import type { Profile } from '@/types'

export async function sendOnboardingWelcome(profile: Profile) {
  if (!profile.phone_e164 || !profile.household_id) return

  const service = createServiceClient()
  const { data: existing } = await service
    .from('sms_messages')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('direction', 'outbound')
    .eq('purpose', 'welcome')
    .limit(1)
    .maybeSingle()

  if (existing) return

  const body = buildWelcomeMessage(profile.display_name, profile.role)
  const result = await sendSMS(profile.phone_e164, body)

  await logSmsMessage(service, {
    householdId: profile.household_id,
    profileId: profile.id,
    direction: 'outbound',
    purpose: 'welcome',
    phoneE164: profile.phone_e164,
    body,
    twilioSid: result.sid,
    status: result.status,
    metadata: {
      recipient_role: profile.role,
      onboarding_welcome: true,
      error: result.error,
    },
  })

  await trackEvent(service, {
    eventName: 'onboarding_welcome_sms_attempted',
    profile,
    userId: profile.user_id,
    properties: {
      status: result.status,
      has_twilio_sid: Boolean(result.sid),
    },
  })
}
