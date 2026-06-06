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

export interface SmsProfileMatchDebug {
  inputPhone: string
  inputDigits: string
  inputLast10: string
  profileCount: number
  profilePhoneEndings: string[]
  smsCount: number
  smsPhoneEndings: string[]
  matchedBy: 'profile_phone' | 'sms_history' | null
  error?: string
}

export interface SmsProfileMatchResult {
  profile: Profile | null
  debug: SmsProfileMatchDebug
}

function phoneDigits(value: string | null | undefined) {
  return normalizePhone(value ?? '').replace(/\D/g, '')
}

function phoneLast10(value: string | null | undefined) {
  const digits = phoneDigits(value)
  return digits.length >= 10 ? digits.slice(-10) : digits
}

function phoneEnding(value: string | null | undefined) {
  const last10 = phoneLast10(value)
  return last10 ? `...${last10.slice(-4)}` : 'blank'
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
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'mci_user')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Unable to load SMS-ready MCI profiles: ${error.message}`)
  }

  return (data ?? []) as SmsReadyProfile[]
}

export async function getSmsProfileByPhone(
  supabase: SupabaseClient,
  phoneE164: string,
) {
  const result = await getSmsProfileMatch(supabase, phoneE164)
  return result.profile
}

export async function getSmsProfileMatch(
  supabase: SupabaseClient,
  phoneE164: string,
): Promise<SmsProfileMatchResult> {
  const normalized = normalizePhone(phoneE164)
  const digits = phoneDigits(normalized)
  const last10 = phoneLast10(normalized)
  const debug: SmsProfileMatchDebug = {
    inputPhone: normalized,
    inputDigits: digits,
    inputLast10: last10,
    profileCount: 0,
    profilePhoneEndings: [],
    smsCount: 0,
    smsPhoneEndings: [],
    matchedBy: null,
  }

  const matchesPhone = (value: string | null) => {
    const valueLast10 = phoneLast10(value)
    return Boolean(last10 && valueLast10 && valueLast10 === last10)
  }

  const { data: rpcProfiles, error: rpcError } = await supabase
    .rpc('find_sms_profile_by_phone', { incoming_phone: normalized })

  if (rpcError) {
    console.error('[SMS] RPC profile lookup failed:', rpcError.message)
  }

  const rpcMatch = Array.isArray(rpcProfiles) ? (rpcProfiles[0] as Profile | undefined) : null
  if (rpcMatch?.household_id) {
    debug.profileCount = rpcProfiles.length
    debug.profilePhoneEndings = Array.from(
      new Set((rpcProfiles as Profile[]).map(profile => phoneEnding(profile.phone_e164))),
    ).slice(0, 8)
    debug.matchedBy = 'profile_phone'
    return { profile: rpcMatch, debug }
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    debug.error = [
      rpcError ? `rpc: ${rpcError.message}` : null,
      `profiles: ${error.message}`,
    ].filter(Boolean).join(' | ')
    console.error('[SMS] Profile lookup failed:', error.message)
    return { profile: null, debug }
  }

  const allProfiles = (data ?? []) as Profile[]
  debug.profileCount = allProfiles.length
  debug.profilePhoneEndings = Array.from(new Set(allProfiles.map(profile => phoneEnding(profile.phone_e164)))).slice(0, 8)

  const profiles = allProfiles.filter(profile => matchesPhone(profile.phone_e164))
  const directMatch = profiles[0] ?? null

  if (directMatch) {
    debug.matchedBy = 'profile_phone'
    return { profile: directMatch, debug }
  }

  const { data: recentSms, error: recentSmsError } = await supabase
    .from('sms_messages')
    .select('profile_id, phone_e164')
    .not('profile_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(250)

  if (recentSmsError) {
    debug.error = `sms_messages: ${recentSmsError.message}`
    console.error('[SMS] SMS history lookup failed:', recentSmsError.message)
    return { profile: null, debug }
  }

  debug.smsCount = recentSms?.length ?? 0
  debug.smsPhoneEndings = Array.from(new Set((recentSms ?? []).map(message => phoneEnding(message.phone_e164)))).slice(0, 8)

  const smsOwner = (recentSms ?? []).find(message => matchesPhone(message.phone_e164))
  if (!smsOwner?.profile_id) return { profile: null, debug }

  const { data: smsProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', smsOwner.profile_id)
    .not('household_id', 'is', null)
    .maybeSingle()

  debug.matchedBy = smsProfile ? 'sms_history' : null
  return { profile: (smsProfile as Profile | null) ?? null, debug }
}
