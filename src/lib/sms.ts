import type { SupabaseClient } from '@supabase/supabase-js'
import type { SmsPurpose } from '@/types'

const DEFAULT_APP_URL = 'https://getcontextapp.com'

export function getAppUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL

  try {
    const url = new URL(rawUrl)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return DEFAULT_APP_URL
    }
    return `${url.origin}${url.pathname}`.replace(/\/$/, '')
  } catch {
    return DEFAULT_APP_URL
  }
}

export const APP_URL = getAppUrl()

export function normalizePhone(phone: string) {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (trimmed.startsWith('+') && digits.length > 0) return `+${digits}`
  return trimmed
}

export type PhoneSaveError = {
  code?: string
  message?: string | null
}

export function getPhoneSaveErrorMessage(error: PhoneSaveError) {
  const message = error.message ?? ''

  if (
    error.code === '23505' ||
    message.includes('profiles_phone_e164_unique') ||
    message.includes('duplicate key') ||
    message.includes('unique constraint')
  ) {
    return 'That phone number is already connected to another Context profile. Please use a different number.'
  }

  return message || 'Could not save this phone number.'
}

export async function logSmsMessage(
  supabase: SupabaseClient,
  input: {
    householdId?: string | null
    profileId?: string | null
    direction: 'inbound' | 'outbound'
    purpose: SmsPurpose
    phoneE164: string
    body: string
    twilioSid?: string | null
    status?: string | null
    metadata?: Record<string, unknown>
  },
) {
  const { error } = await supabase.from('sms_messages').insert({
    household_id: input.householdId ?? null,
    profile_id: input.profileId ?? null,
    direction: input.direction,
    purpose: input.purpose,
    phone_e164: normalizePhone(input.phoneE164),
    body: input.body,
    twilio_sid: input.twilioSid ?? null,
    status: input.status ?? 'recorded',
    metadata: input.metadata ?? {},
  })

  if (error) console.error('[SMS] Log failed:', error.message)

  if (input.profileId || input.householdId) {
    const normalizedPhone = normalizePhone(input.phoneE164)
    const { error: analyticsError } = await supabase.from('analytics_events').insert({
      user_id: null,
      profile_id: input.profileId ?? null,
      household_id: input.householdId ?? null,
      role: null,
      event_name: `sms_${input.direction}_${input.purpose}`,
      properties: {
        direction: input.direction,
        purpose: input.purpose,
        status: input.status ?? 'recorded',
        body_length: input.body.length,
        phone_last4: normalizedPhone.slice(-4),
        has_twilio_sid: Boolean(input.twilioSid),
        metadata_keys: Object.keys(input.metadata ?? {}),
      },
    })

    if (analyticsError) console.error('[SMS] Analytics log failed:', analyticsError.message)
  }
}

export function buildMorningPrompt(displayName: string) {
  return [
    `Good morning, ${displayName}. What are a few things you want to do today?`,
    ``,
    `You can reply here, or open Context: ${APP_URL}/mci-user`,
  ].join('\n')
}

export function buildWelcomeMessage(displayName: string, role: 'mci_user' | 'care_partner') {
  if (role === 'care_partner') {
    return [
      `Welcome to Context, ${displayName}.`,
      `This is the Context text number. We will send gentle household updates and daily summaries here.`,
      `Your care partner dashboard: ${APP_URL}/care-partner`,
    ].join('\n\n')
  }

  return [
    `Welcome to Context, ${displayName}. You can text this number naturally whenever you like.`,
    `Try: "Walk, call Mary, dinner" to add today's plans.`,
    `Text DONE to choose finished tasks, UNDO to reopen one, DELETE to remove one safely, STATUS to see what is waiting, or HELP for this guide.`,
    `Your dashboard: ${APP_URL}/mci-user`,
  ].join('\n\n')
}

export function buildMorningFollowup(displayName: string) {
  return [
    `Just checking in, ${displayName}.`,
    `If it helps, reply with one thing you want to do today, or open Context: ${APP_URL}/mci-user`,
  ].join('\n')
}

export function buildCarePartnerNoResponse(memberName: string) {
  return [
    `Context has not received today's plan from ${memberName} yet.`,
    `You can check in when convenient or view Context: ${APP_URL}/care-partner`,
  ].join('\n')
}

export function buildPlanSavedReply(count: number) {
  const itemText = count === 1 ? '1 item' : `${count} items`
  return `I added ${itemText} to today's Context plan. Open it here: ${APP_URL}/mci-user`
}

export function twiml(message: string) {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`
}
