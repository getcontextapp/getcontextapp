import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import MCIUserClient from './MCIUserClient'

export default async function MCIUserPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role !== 'mci_user') redirect('/')

  // Fetch today's activities
  const todayRange = getUtcRangeForLocalDay(new Date(), profile.timezone)

  const { data: activities } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('household_id', profile.household_id)
    .gte('occurred_at', todayRange.start)
    .lt('occurred_at', todayRange.end)
    .order('occurred_at', { ascending: false })
    .limit(20)

  const { data: plannedActivities } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', getLocalDateKey(new Date(), profile.timezone))
    .order('created_at', { ascending: true })

  // Fetch active context card
  const { data: contextCard } = await supabase
    .from('context_cards')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Fetch household join code
  const { data: household } = await supabase
    .from('households')
    .select('join_code, name')
    .eq('id', profile.household_id)
    .single()

  return (
    <MCIUserClient
      profile={profile}
      initialActivities={activities ?? []}
      initialPlannedActivities={plannedActivities ?? []}
      initialContextCard={contextCard ?? null}
      household={household ?? null}
    />
  )
}
