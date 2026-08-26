import { createServerClient, createServiceClient } from '@/lib/supabase-server'

export async function getNotificationContext() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,user_id,household_id,role,display_name,timezone,phone_e164')
    .eq('user_id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found', status: 404 as const }

  const service = createServiceClient()
  const { data: household } = profile.household_id
    ? await service.from('households').select('id,name').eq('id', profile.household_id).maybeSingle()
    : { data: null }
  const eligible = Boolean(household)

  return { user, profile, household, service, eligible }
}
