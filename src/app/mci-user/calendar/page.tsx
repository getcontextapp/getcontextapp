import { redirect } from 'next/navigation'
import { getLocalDateKey, getUtcRangeForLocalDateKey } from '@/lib/dates'
import { getCalendarRangeData } from '@/lib/calendar-sync'
import { createServerClient } from '@/lib/supabase-server'
import { latestFeatureRolloutEnabled } from '@/lib/feature-rollout'
import type { PlannedActivity } from '@/types'
import CalendarView from './CalendarView'

function dateOffset(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export default async function CalendarPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
  if (!profile || profile.role !== 'mci_user') redirect('/')

  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const household = await supabase.from('households').select('name,created_at').eq('id', profile.household_id).single()
  const householdOnboardingAt = household.data?.created_at && profile.created_at
    ? new Date(Math.min(new Date(household.data.created_at).getTime(), new Date(profile.created_at).getTime())).toISOString()
    : household.data?.created_at ?? profile.created_at
  const futureCalendarEnabled = latestFeatureRolloutEnabled(household.data?.name ?? '', householdOnboardingAt)
  const futureDays = futureCalendarEnabled ? 365 : 70
  const startKey = dateOffset(todayKey, -35)
  const endKey = dateOffset(todayKey, futureDays)
  const start = getUtcRangeForLocalDateKey(startKey, profile.timezone).start
  const end = getUtcRangeForLocalDateKey(endKey, profile.timezone).start
  const [calendar, planResult] = await Promise.all([
    getCalendarRangeData(supabase, profile, start, end, futureDays),
    supabase
      .from('planned_activities')
      .select('*')
      .eq('household_id', profile.household_id)
      .gte('planned_for', startKey)
      .lt('planned_for', endKey)
      .neq('status', 'abandoned')
      .order('planned_for', { ascending: true })
      .limit(1000),
  ])

  return (
    <CalendarView
      firstName={profile.display_name.trim().split(/\s+/)[0] || profile.display_name}
      todayKey={todayKey}
      timeZone={profile.timezone}
      events={calendar.events}
      plans={(planResult.data ?? []) as PlannedActivity[]}
      linkedPlanIds={calendar.linkedPlanIds}
      connected={Boolean(calendar.connection)}
      canManage
      ownerProfileId={profile.id}
      futureCalendarEnabled={futureCalendarEnabled}
    />
  )
}
