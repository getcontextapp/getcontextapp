import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@/types'
import { normalizePhone } from '@/lib/sms'

export interface HouseholdMembers {
  mciProfile: Profile | null
  carePartners: Profile[]
  profiles: Profile[]
}

export type SmsReadyProfile = Profile & {
  phone_e164: string
  household_id: string
}

export async function getHouseholdMembers(
  supabase: SupabaseClient,
  householdId: string | null,
  currentProfileId?: string | null,
): Promise<HouseholdMembers> {
  if (!householdId) return { mciProfile: null, carePartners: [], profiles: [] }

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })

  const profiles = (data ?? []) as Profile[]
  const carePartners = profiles.filter(profile => profile.role === 'care_partner')
  const mciProfile =
    profiles.find(profile => profile.role === 'mci_user') ??
    profiles.find(profile => profile.id !== currentProfileId && profile.role !== 'care_partner') ??
    profiles.find(profile => profile.id !== currentProfileId) ??
    null

  return { mciProfile, carePartners, profiles }
}

export async function getLinkedMciProfile(
  supabase: SupabaseClient,
  householdId: string | null,
  currentProfileId?: string | null,
) {
  const household = await getHouseholdMembers(supabase, householdId, currentProfileId)
  return household.mciProfile
}

export async function getCarePartnersForHousehold(
  supabase: SupabaseClient,
  householdId: string | null,
) {
  const household = await getHouseholdMembers(supabase, householdId)
  return household.carePartners.filter(profile => Boolean(profile.phone_e164))
}

export async function getMciProfilesForSms(supabase: SupabaseClient): Promise<SmsReadyProfile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'mci_user')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)
    .order('created_at', { ascending: true })

  return (data ?? []) as SmsReadyProfile[]
}

export async function getSmsProfileByPhone(
  supabase: SupabaseClient,
  phoneE164: string,
) {
  const normalized = normalizePhone(phoneE164)
  const digits = normalized.replace(/\D/g, '')
  const withoutCountry = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  const matchesPhone = (value: string | null) => {
    if (!value) return false
    const valueDigits = normalizePhone(value).replace(/\D/g, '')
    const valueWithoutCountry = valueDigits.length === 11 && valueDigits.startsWith('1')
      ? valueDigits.slice(1)
      : valueDigits

    return valueDigits === digits || valueWithoutCountry === withoutCountry
  }

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)
    .order('created_at', { ascending: true })

  const profiles = ((data ?? []) as Profile[]).filter(profile => matchesPhone(profile.phone_e164))
  const directMatch =
    profiles.find(profile => profile.role === 'mci_user') ??
    profiles[0] ??
    null

  if (directMatch) return directMatch

  const { data: recentSms } = await supabase
    .from('sms_messages')
    .select('profile_id, phone_e164')
    .not('profile_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  const smsOwner = (recentSms ?? []).find(message => matchesPhone(message.phone_e164))
  if (!smsOwner?.profile_id) return null

  const { data: smsProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', smsOwner.profile_id)
    .not('household_id', 'is', null)
    .maybeSingle()

  return (smsProfile as Profile | null) ?? null
}
