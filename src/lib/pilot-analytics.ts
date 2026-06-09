import { createServiceClient } from '@/lib/supabase-server'

export interface AnalyticsFilters {
  days: number
  householdId: string
  role: string
}

type ProfileRow = {
  id: string
  user_id: string
  role: string
  display_name: string
  household_id: string | null
  created_at: string
}

type EventRow = {
  id: string
  profile_id: string | null
  household_id: string | null
  role: string | null
  event_name: string
  properties: Record<string, unknown>
  created_at: string
}

type SmsRow = {
  id: string
  profile_id: string | null
  household_id: string | null
  direction: 'inbound' | 'outbound'
  purpose: string
  status: string
  metadata: Record<string, unknown>
  created_at: string
}

type PlanRow = {
  id: string
  household_id: string
  created_by: string
  status: string
  source: string
  created_at: string
  confirmed_at: string | null
}

function dateKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10)
}

function startOfWeek(value: string | Date) {
  const date = new Date(value)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - day)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

function weekDiff(from: string | Date, to: string | Date) {
  return Math.floor((startOfWeek(to).getTime() - startOfWeek(from).getTime()) / 604_800_000)
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function firstDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? null
}

export async function loadPilotAnalytics(filters: AnalyticsFilters) {
  const service = createServiceClient()
  const now = new Date()
  const filterStart = new Date(now.getTime() - filters.days * 86_400_000)
  const historyStart = new Date(Math.min(filterStart.getTime(), now.getTime() - 84 * 86_400_000))

  const [
    profilesResult,
    householdsResult,
    eventsResult,
    smsResult,
    plansResult,
    activitiesResult,
  ] = await Promise.all([
    service.from('profiles').select('id,user_id,role,display_name,household_id,created_at').order('created_at'),
    service.from('households').select('id,name,created_at').order('created_at'),
    service.from('analytics_events').select('id,profile_id,household_id,role,event_name,properties,created_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(10000),
    service.from('sms_messages').select('id,profile_id,household_id,direction,purpose,status,metadata,created_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(10000),
    service.from('planned_activities').select('id,household_id,created_by,status,source,created_at,confirmed_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(10000),
    service.from('activity_logs').select('id,household_id,logged_by,created_at,occurred_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(10000),
  ])

  const profiles = (profilesResult.data ?? []) as ProfileRow[]
  const households = householdsResult.data ?? []
  const events = (eventsResult.data ?? []) as EventRow[]
  const sms = (smsResult.data ?? []) as SmsRow[]
  const plans = (plansResult.data ?? []) as PlanRow[]
  const activities = activitiesResult.data ?? []
  const householdNames = new Map(households.map(household => [household.id, household.name]))

  const includedProfiles = profiles.filter(profile =>
    (!filters.householdId || profile.household_id === filters.householdId) &&
    (!filters.role || profile.role === filters.role)
  )
  const profileIds = new Set(includedProfiles.map(profile => profile.id))
  const householdIds = new Set(includedProfiles.map(profile => profile.household_id).filter(Boolean))
  const inRange = (createdAt: string) => new Date(createdAt) >= filterStart
  const belongs = (row: { profile_id?: string | null; household_id?: string | null }) =>
    (!row.profile_id || profileIds.has(row.profile_id)) &&
    (!filters.householdId || row.household_id === filters.householdId)

  const filteredEvents = events.filter(row => inRange(row.created_at) && belongs(row))
  const filteredSms = sms.filter(row => inRange(row.created_at) && belongs(row))
  const filteredPlans = plans.filter(row =>
    inRange(row.created_at) &&
    householdIds.has(row.household_id) &&
    (!filters.role || profileIds.has(row.created_by))
  )
  const filteredActivities = activities.filter(row =>
    inRange(row.created_at) && householdIds.has(row.household_id)
  )

  const activeProfileIds = new Set([
    ...filteredEvents.map(row => row.profile_id).filter(Boolean),
    ...filteredSms.filter(row => row.direction === 'inbound').map(row => row.profile_id).filter(Boolean),
  ])
  const completedPlans = filteredPlans.filter(plan => plan.status === 'confirmed')
  const outboundSms = filteredSms.filter(message => message.direction === 'outbound')
  const inboundSms = filteredSms.filter(message => message.direction === 'inbound')
  const failedSms = outboundSms.filter(message => message.status === 'failed')

  const promptPurposes = new Set(['welcome', 'morning_prompt', 'morning_followup', 'pending_reminder'])
  const responseMinutes: number[] = []
  let promptsWithReply = 0
  const prompts = filteredSms.filter(message => message.direction === 'outbound' && promptPurposes.has(message.purpose))
  const smsByProfile = new Map<string, SmsRow[]>()
  for (const message of filteredSms) {
    if (!message.profile_id) continue
    smsByProfile.set(message.profile_id, [...(smsByProfile.get(message.profile_id) ?? []), message])
  }
  for (const prompt of prompts) {
    if (!prompt.profile_id) continue
    const reply = (smsByProfile.get(prompt.profile_id) ?? []).find(message =>
      message.direction === 'inbound' &&
      new Date(message.created_at) > new Date(prompt.created_at) &&
      new Date(message.created_at).getTime() - new Date(prompt.created_at).getTime() <= 86_400_000
    )
    if (reply) {
      promptsWithReply++
      responseMinutes.push((new Date(reply.created_at).getTime() - new Date(prompt.created_at).getTime()) / 60_000)
    }
  }

  const daily = Array.from({ length: filters.days }, (_, index) => {
    const date = new Date(filterStart)
    date.setUTCDate(date.getUTCDate() + index + 1)
    const key = dateKey(date)
    return {
      date: key,
      events: filteredEvents.filter(row => dateKey(row.created_at) === key).length,
      inbound: inboundSms.filter(row => dateKey(row.created_at) === key).length,
      outbound: outboundSms.filter(row => dateKey(row.created_at) === key).length,
      completions: filteredPlans.filter(row => row.confirmed_at && dateKey(row.confirmed_at) === key).length,
    }
  })

  const eventCounts = new Map<string, number>()
  for (const event of filteredEvents) {
    eventCounts.set(event.event_name, (eventCounts.get(event.event_name) ?? 0) + 1)
  }
  const features = [...eventCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const roleSummary = ['mci_user', 'care_partner'].map(role => {
    const roleProfiles = includedProfiles.filter(profile => profile.role === role)
    const ids = new Set(roleProfiles.map(profile => profile.id))
    return {
      role,
      profiles: roleProfiles.length,
      active: new Set(filteredEvents.filter(event => event.profile_id && ids.has(event.profile_id)).map(event => event.profile_id)).size,
      events: filteredEvents.filter(event => event.profile_id && ids.has(event.profile_id)).length,
      inboundSms: inboundSms.filter(message => message.profile_id && ids.has(message.profile_id)).length,
    }
  })

  const activityDatesByProfile = new Map<string, string[]>()
  for (const event of events) {
    if (event.profile_id) activityDatesByProfile.set(event.profile_id, [...(activityDatesByProfile.get(event.profile_id) ?? []), event.created_at])
  }
  for (const message of sms) {
    if (message.profile_id && message.direction === 'inbound') {
      activityDatesByProfile.set(message.profile_id, [...(activityDatesByProfile.get(message.profile_id) ?? []), message.created_at])
    }
  }

  const cohortProfiles = includedProfiles.filter(profile => new Date(profile.created_at) >= historyStart)
  const cohortMap = new Map<string, ProfileRow[]>()
  for (const profile of cohortProfiles) {
    const cohort = dateKey(startOfWeek(profile.created_at))
    cohortMap.set(cohort, [...(cohortMap.get(cohort) ?? []), profile])
  }
  const cohorts = [...cohortMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohort, members]) => {
    const retention = Array.from({ length: 8 }, (_, week) => {
      const retained = members.filter(profile =>
        (activityDatesByProfile.get(profile.id) ?? []).some(date => weekDiff(profile.created_at, date) === week)
      ).length
      return percent(retained, members.length)
    })
    return { cohort, size: members.length, retention }
  })

  const journeys = includedProfiles.map(profile => {
    const profileEvents = events.filter(event => event.profile_id === profile.id)
    const profileSms = sms.filter(message => message.profile_id === profile.id)
    const profilePlans = plans.filter(plan => plan.created_by === profile.id || plan.household_id === profile.household_id)
    const activityDates = [
      ...profileEvents.map(event => event.created_at),
      ...profileSms.map(message => message.created_at),
      ...profilePlans.map(plan => plan.created_at),
    ].sort()
    return {
      profileId: profile.id,
      name: profile.display_name,
      role: profile.role,
      household: profile.household_id ? householdNames.get(profile.household_id) ?? 'Unknown' : 'Unlinked',
      joinedAt: profile.created_at,
      firstDashboard: firstDate(profileEvents.filter(event => event.event_name.endsWith('dashboard_viewed')).map(event => event.created_at)),
      firstPlan: firstDate(profilePlans.map(plan => plan.created_at)),
      firstCompletion: firstDate(profilePlans.map(plan => plan.confirmed_at)),
      firstSmsReply: firstDate(profileSms.filter(message => message.direction === 'inbound').map(message => message.created_at)),
      lastActive: activityDates.at(-1) ?? null,
      eventCount: profileEvents.filter(event => inRange(event.created_at)).length,
      smsReplies: profileSms.filter(message => message.direction === 'inbound' && inRange(message.created_at)).length,
    }
  }).sort((a, b) => (b.lastActive ?? '').localeCompare(a.lastActive ?? ''))

  const householdRows = households
    .filter(household => !filters.householdId || household.id === filters.householdId)
    .map(household => {
      const members = includedProfiles.filter(profile => profile.household_id === household.id)
      const ids = new Set(members.map(member => member.id))
      const householdPlans = filteredPlans.filter(plan => plan.household_id === household.id)
      const householdEvents = filteredEvents.filter(event => event.household_id === household.id)
      const householdSms = filteredSms.filter(message => message.household_id === household.id)
      const lastActive = [
        ...householdEvents.map(event => event.created_at),
        ...householdSms.map(message => message.created_at),
      ].sort().at(-1) ?? null
      return {
        id: household.id,
        name: household.name,
        members: members.map(member => member.display_name).join(', '),
        mci: members.filter(member => member.role === 'mci_user').length,
        carePartners: members.filter(member => member.role === 'care_partner').length,
        plans: householdPlans.length,
        completionRate: percent(householdPlans.filter(plan => plan.status === 'confirmed').length, householdPlans.length),
        smsReplies: householdSms.filter(message => message.direction === 'inbound' && ids.has(message.profile_id ?? '')).length,
        lastActive,
      }
    })
    .filter(row => row.members)

  return {
    filters,
    generatedAt: now.toISOString(),
    households: households.map(household => ({ id: household.id, name: household.name })),
    kpis: {
      profiles: includedProfiles.length,
      households: new Set(includedProfiles.map(profile => profile.household_id).filter(Boolean)).size,
      activeUsers: activeProfileIds.size,
      activationRate: percent(includedProfiles.filter(profile => profile.household_id).length, includedProfiles.length),
      plans: filteredPlans.length,
      completionRate: percent(completedPlans.length, filteredPlans.length),
      activities: filteredActivities.length,
      outboundSms: outboundSms.length,
      inboundSms: inboundSms.length,
      smsFailureRate: percent(failedSms.length, outboundSms.length),
      promptResponseRate: percent(promptsWithReply, prompts.length),
      averageResponseMinutes: responseMinutes.length
        ? Math.round(responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length)
        : 0,
      medianResponseMinutes: Math.round(median(responseMinutes)),
    },
    daily,
    features,
    roleSummary,
    cohorts,
    journeys,
    householdRows,
    exports: {
      events: filteredEvents,
      sms: filteredSms,
      plans: filteredPlans,
      journeys,
      households: householdRows,
    },
  }
}
