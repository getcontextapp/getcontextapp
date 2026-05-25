import type { SupabaseClient } from '@supabase/supabase-js'
import type { SmsPurpose } from '@/types'

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://getcontextapp.com'

export function normalizePhone(phone: string) {
  const trimmed = phone.trim()
  if (trimmed.startsWith('+')) return trimmed

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return trimmed
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
}

export function buildMorningPrompt(displayName: string) {
  return [
    `Good morning, ${displayName}. What are a few things you want to do today?`,
    ``,
    `You can reply here, or open Context: ${APP_URL}/mci-user`,
  ].join('\n')
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

