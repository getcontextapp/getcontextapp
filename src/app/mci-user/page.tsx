import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { linkSavedPhoneToAuth } from '@/lib/auth-phone'
import { getHouseholdMembers } from '@/lib/household-links'
import { reflectionToClient } from '@/lib/reflections'
import { ensureRepeatOccurrencesForDate } from '@/lib/task-scheduling-server'
import MCIUserClient from './MCIUserClient'

function dashboardSource(value: string | string[] | undefined) {
  const source = Array.isArray(value) ? value[0] : value
  return source === 'sms_link' || source === 'home_screen' ? source : 'direct'
}

export default async function MCIUserPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.role !== 'mci_user') redirect('/')

  await linkSavedPhoneToAuth(user.id, user.phone, profile.phone_e164)

  // Fetch today's activities
  const todayRange = getUtcRangeForLocalDay(new Date(), profile.timezone)
  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  await ensureRepeatOccurrencesForDate(supabase, profile.household_id, todayKey)

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
    .eq('planned_for', todayKey)
    .in('status', ['planned', 'not_now', 'confirmed'])
    .order('created_at', { ascending: true })

  const { data: timelineEvents } = await supabase
    .from('timeline_events')
    .select('*')
    .eq('household_id', profile.household_id)
    .gte('created_at', todayRange.start)
    .lt('created_at', todayRange.end)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: reflection } = await supabase
    .from('reflections')
    .select('*')
    .eq('user_id', profile.user_id)
    .eq('reflection_date', todayKey)
    .maybeSingle()

  // Fetch household join code
  const { data: household } = await supabase
    .from('households')
    .select('join_code, name')
    .eq('id', profile.household_id)
    .single()

  const members = await getHouseholdMembers(supabase, profile.household_id, profile.id)
  const carePartner = members.carePartners.find(member => member.phone_e164) ?? members.carePartners[0] ?? null

  return (
    <MCIUserClient
      profile={profile}
      initialActivities={activities ?? []}
      initialPlannedActivities={plannedActivities ?? []}
      initialTimelineEvents={timelineEvents ?? []}
      initialReflection={reflection ? reflectionToClient(reflection) : null}
      carePartner={carePartner}
      household={household ?? null}
      dashboardSource={dashboardSource(params?.source)}
    />
  )
}
