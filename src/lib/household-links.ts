import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@/types'

export async function getLinkedMciProfile(
  supabase: SupabaseClient,
  householdId: string | null,
  currentProfileId?: string | null,
) {
  if (!householdId) return null

  const { data: mciProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('household_id', householdId)
    .eq('role', 'mci_user')
    .maybeSingle()

  if (mciProfile) return mciProfile as Profile

  const query = supabase
    .from('profiles')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (currentProfileId) query.neq('id', currentProfileId)

  const { data: householdProfiles } = await query
  return (householdProfiles?.[0] ?? null) as Profile | null
}
