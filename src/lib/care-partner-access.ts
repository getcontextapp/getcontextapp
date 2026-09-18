import type { SupabaseClient } from '@supabase/supabase-js'
import { getLinkedMciProfile } from '@/lib/household-links'
import type { Profile } from '@/types'

export function canManageParticipantSchedule(currentProfile: Profile, participantProfile: Profile) {
  if (currentProfile.role === 'mci_user') return currentProfile.id === participantProfile.id
  return currentProfile.role === 'care_partner'
    && currentProfile.household_id === participantProfile.household_id
    && participantProfile.role === 'mci_user'
    && participantProfile.care_partner_calendar_management === true
}

export async function resolveParticipantScheduleOwner(
  supabase: SupabaseClient,
  currentProfile: Profile,
  ownerProfileId?: string | null,
  requireManage = false,
) {
  const owner = currentProfile.role === 'mci_user'
    ? currentProfile
    : await getLinkedMciProfile(supabase, currentProfile.household_id, currentProfile.id)

  if (!owner || (ownerProfileId && ownerProfileId !== owner.id)) return null
  if (requireManage && !canManageParticipantSchedule(currentProfile, owner)) return null
  return owner
}
