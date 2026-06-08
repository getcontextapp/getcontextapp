import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey } from '@/lib/dates'
import { getLinkedMciProfile } from '@/lib/household-links'
import { linkSavedPhoneToAuth } from '@/lib/auth-phone'
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

  await linkSavedPhoneToAuth(user.id, user.phone, profile.phone_e164)

  const linkedProfile = await getLinkedMciProfile(supabase, profile.household_id, profile.id)

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

  const { data: plannedActivities } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', getLocalDateKey(new Date(), profile.timezone))
    .order('created_at', { ascending: true })

  return (
    <CarePartnerClient
      careProfile={profile}
      mciProfile={linkedProfile}
      initialActivities={activities ?? []}
      initialPlannedActivities={plannedActivities ?? []}
    />
  )
}
