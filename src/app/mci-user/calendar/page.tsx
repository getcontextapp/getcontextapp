import { redirect } from 'next/navigation'
import { getLocalDateKey, getUtcRangeForLocalDateKey } from '@/lib/dates'
import { getCalendarRangeData } from '@/lib/calendar-sync'
import { createServerClient } from '@/lib/supabase-server'
import { cohortForHouseholdName } from '@/lib/pilot-cohorts'
import { ensureRepeatOccurrencesForRange } from '@/lib/task-scheduling-server'
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
  const household = await supabase.from('households').select('name').eq('id', profile.household_id).single()
  const futureCalendarEnabled = cohortForHouseholdName(household.data?.name ?? '').cohort === 'internal'
  const futureDays = futureCalendarEnabled ? 365 : 70
  const startKey = dateOffset(todayKey, -35)
  const endKey = dateOffset(todayKey, futureDays)
  const start = getUtcRangeForLocalDateKey(startKey, profile.timezone).start
  const end = getUtcRangeForLocalDateKey(endKey, profile.timezone).start
  await ensureRepeatOccurrencesForRange(supabase, profile.household_id, startKey, endKey)
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
