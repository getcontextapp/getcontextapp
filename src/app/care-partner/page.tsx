import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase-server'
import CarePartnerClient from './CarePartnerClient'

export default async function CarePartnerPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role !== 'care_partner') redirect('/')

  const serviceSupabase = createServiceClient()

  // Get the MCI user in the same household
  const { data: mciProfile } = await serviceSupabase
    .from('profiles')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('role', 'mci_user')
    .single()

  // Fetch last 7 days of activities
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: activities } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('household_id', profile.household_id)
    .gte('occurred_at', sevenDaysAgo.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(100)

  // Fetch household
  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('id', profile.household_id)
    .single()

  return (
    <CarePartnerClient
      careProfile={profile}
      mciProfile={mciProfile ?? null}
      initialActivities={activities ?? []}
      household={household ?? null}
    />
  )
}
