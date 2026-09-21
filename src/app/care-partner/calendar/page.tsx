import { redirect } from 'next/navigation'
import { getLocalDateKey, getUtcRangeForLocalDateKey } from '@/lib/dates'
import { getCalendarRangeData } from '@/lib/calendar-sync'
import { getLinkedMciProfile } from '@/lib/household-links'
import { createServerClient } from '@/lib/supabase-server'
import { cohortForHouseholdName } from '@/lib/pilot-cohorts'
import { ensureRepeatOccurrencesForRange } from '@/lib/task-scheduling-server'
import type { PlannedActivity } from '@/types'
import CalendarView from '@/app/mci-user/calendar/CalendarView'

function dateOffset(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export default async function CarePartnerCalendarPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
  if (!profile || profile.role !== 'care_partner') redirect('/')
  const participant = await getLinkedMciProfile(supabase, profile.household_id, profile.id)
  if (!participant?.household_id) redirect('/care-partner')

  const todayKey = getLocalDateKey(new Date(), participant.timezone)
  const { data: household } = await supabase.from('households').select('name').eq('id', participant.household_id).single()
  const futureCalendarEnabled = cohortForHouseholdName(household?.name ?? '').cohort === 'internal'
  const futureDays = futureCalendarEnabled ? 365 : 70
  const startKey = dateOffset(todayKey, -35)
  const endKey = dateOffset(todayKey, futureDays)
  const start = getUtcRangeForLocalDateKey(startKey, participant.timezone).start
  const end = getUtcRangeForLocalDateKey(endKey, participant.timezone).start
  await ensureRepeatOccurrencesForRange(supabase, participant.household_id, startKey, endKey)
  const [calendar, planResult] = await Promise.all([
    getCalendarRangeData(supabase, participant, start, end, futureDays, false),
    supabase.from('planned_activities').select('*')
      .eq('household_id', participant.household_id)
      .eq('assigned_to', participant.id)
      .gte('planned_for', startKey).lt('planned_for', endKey)
      .neq('status', 'abandoned').order('planned_for', { ascending: true }).limit(1000),
  ])

  return (
    <CalendarView
      firstName={profile.display_name.trim().split(/\s+/)[0] || profile.display_name}
      todayKey={todayKey}
      timeZone={participant.timezone}
      events={calendar.events}
      plans={(planResult.data ?? []) as PlannedActivity[]}
      linkedPlanIds={calendar.linkedPlanIds}
      connected={Boolean(calendar.connection)}
      canManage={Boolean(participant.care_partner_calendar_management)}
      ownerProfileId={participant.id}
      homeHref="/care-partner"
      viewLabel={`${participant.display_name}'s schedule`}
      futureCalendarEnabled={futureCalendarEnabled}
    />
  )
}
