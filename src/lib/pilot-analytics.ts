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

type HouseholdRow = {
  id: string
  name: string
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
  planned_for: string
  created_at: string
  confirmed_at: string | null
}

type ActivityRow = {
  id: string
  household_id: string
  logged_by: string | null
  created_at: string
  occurred_at: string
}

export type OutcomeRole = 'mci' | 'cp'
export type OutcomeSession = 'pre' | 'post'

export type OutcomeRow = {
  id: string
  household_id: string
  profile_id: string | null
  role: OutcomeRole
  session: OutcomeSession
  measure_key: string
  score: number | null
  recorded_at: string
}

export const OUTCOME_MEASURES = [
  { key: 'confidence_remembering', role: 'mci', label: 'MCI remembering' },
  { key: 'orientation_help', role: 'mci', label: 'MCI orientation' },
  { key: 'confidence_using_context', role: 'mci', label: 'MCI confidence' },
  { key: 'reminder_burden', role: 'cp', label: 'CP burden' },
  { key: 'reassurance', role: 'cp', label: 'CP reassurance' },
  { key: 'confidence_supporting', role: 'cp', label: 'CP support' },
] as const

function dateKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10)
}

function dayDiff(from: string | Date, to: string | Date) {
  const start = new Date(from)
  const end = new Date(to)
  start.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(0, 0, 0, 0)
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000)
}

function daysSince(from: string | Date, now: Date) {
  return Math.max(0, dayDiff(from, now))
}

function hoursSince(value: string | null, now: Date) {
  if (!value) return null
  return Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 3_600_000))
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function firstDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? null
}

function latestDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
}

function studyPhase(daysFromOnboarding: number) {
  if (daysFromOnboarding <= 1) return 'pre'
  if (daysFromOnboarding <= 14) return 'active'
  if (daysFromOnboarding <= 28) return 'quiet'
  return 'complete'
}

function statusFlag(hours: Array<number | null>) {
  if (hours.some(value => value === null || value > 48)) return 'red'
  if (hours.some(value => value !== null && value > 24)) return 'amber'
  return 'green'
}

function humanEventLabel(name: string) {
  const labels: Record<string, string> = {
    mci_dashboard_viewed: 'MCI dashboard viewed',
    care_partner_dashboard_viewed: 'Care partner dashboard viewed',
    planned_activity_created: 'Plan added',
    planned_activity_confirmed: 'Plan marked done',
    planned_activity_moved: 'Plan moved',
    planned_activity_deleted: 'Plan deleted',
    natural_language_plan_parsed: 'Smart input parsed plan',
    natural_language_timeline_parsed: 'Moment saved',
    natural_language_recall_requested: 'Recall requested from input',
    reentry_recall_requested: 'What was I doing used',
    sms_inbound_inbound_plan_reply: 'SMS plan reply',
    sms_inbound_inbound_confirmation: 'SMS confirmation reply',
    sms_completed_activity_parsed: 'SMS completed activity',
    sms_pending_status_requested: 'SMS status request',
    context_card_viewed: 'Context card viewed',
    weekly_summary_viewed: 'Weekly summary viewed',
  }
  return labels[name] ?? name.replaceAll('_', ' ')
}

function isStudyEvent(name: string) {
  if (name.startsWith('sms_outbound_')) return false
  if (name.includes('attempted') || name.includes('failed')) return false
  if (name.includes('test') || name.includes('cron')) return false
  if (name === 'analytics_export_downloaded') return false
  return true
}

function profileRoleLabel(role: string) {
  return role === 'mci_user' ? 'MCI' : role === 'care_partner' ? 'CP' : role
}

function outcomeKey(role: OutcomeRole, session: OutcomeSession, measureKey: string) {
  return `${role}:${session}:${measureKey}`
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.toLowerCase().includes('study_outcomes')
    ),
  )
}

export async function loadPilotAnalytics(filters: AnalyticsFilters) {
  const service = createServiceClient()
  const now = new Date()
  const filterStart = new Date(now.getTime() - filters.days * 86_400_000)
  const historyStart = new Date(now.getTime() - 120 * 86_400_000)

  const [
    profilesResult,
    householdsResult,
    eventsResult,
    smsResult,
    plansResult,
    activitiesResult,
    outcomesResult,
  ] = await Promise.all([
    service.from('profiles').select('id,user_id,role,display_name,household_id,created_at').order('created_at'),
    service.from('households').select('id,name,created_at').order('created_at'),
    service.from('analytics_events').select('id,profile_id,household_id,role,event_name,properties,created_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
    service.from('sms_messages').select('id,profile_id,household_id,direction,purpose,status,metadata,created_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
    service.from('planned_activities').select('id,household_id,created_by,status,source,planned_for,created_at,confirmed_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
    service.from('activity_logs').select('id,household_id,logged_by,created_at,occurred_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
    service.from('study_outcomes').select('id,household_id,profile_id,role,session,measure_key,score,recorded_at')
      .order('recorded_at', { ascending: false }),
  ])

  if (profilesResult.error) throw new Error(profilesResult.error.message)
  if (householdsResult.error) throw new Error(householdsResult.error.message)
  if (eventsResult.error) throw new Error(eventsResult.error.message)
  if (smsResult.error) throw new Error(smsResult.error.message)
  if (plansResult.error) throw new Error(plansResult.error.message)
  if (activitiesResult.error) throw new Error(activitiesResult.error.message)
  const outcomesUnavailable = isMissingTableError(outcomesResult.error)
  if (outcomesResult.error && !outcomesUnavailable) throw new Error(outcomesResult.error.message)

  const profiles = (profilesResult.data ?? []) as ProfileRow[]
  const households = (householdsResult.data ?? []) as HouseholdRow[]
  const events = (eventsResult.data ?? []) as EventRow[]
  const sms = (smsResult.data ?? []) as SmsRow[]
  const plans = (plansResult.data ?? []) as PlanRow[]
  const activities = (activitiesResult.data ?? []) as ActivityRow[]
  const outcomes = (outcomesUnavailable ? [] : outcomesResult.data ?? []) as OutcomeRow[]

  const includedHouseholds = households.filter(household => !filters.householdId || household.id === filters.householdId)
  const householdIds = new Set(includedHouseholds.map(household => household.id))
  const includedProfiles = profiles.filter(profile => profile.household_id && householdIds.has(profile.household_id))
  const householdNames = new Map(households.map(household => [household.id, household.name]))
  const profilesByHousehold = new Map<string, ProfileRow[]>()
  for (const profile of includedProfiles) {
    if (!profile.household_id) continue
    profilesByHousehold.set(profile.household_id, [...(profilesByHousehold.get(profile.household_id) ?? []), profile])
  }

  const inRange = (createdAt: string) => new Date(createdAt) >= filterStart
  const filteredEvents = events.filter(row => inRange(row.created_at) && row.household_id && householdIds.has(row.household_id))
  const filteredSms = sms.filter(row => inRange(row.created_at) && row.household_id && householdIds.has(row.household_id))
  const filteredPlans = plans.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredActivities = activities.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))

  const activityDatesForProfile = (profile: ProfileRow) => [
    ...events.filter(event => event.profile_id === profile.id).map(event => event.created_at),
    ...sms.filter(message => message.profile_id === profile.id && message.direction === 'inbound').map(message => message.created_at),
    ...plans.filter(plan => plan.created_by === profile.id).flatMap(plan => [plan.created_at, plan.confirmed_at].filter(Boolean) as string[]),
    ...activities.filter(activity => activity.logged_by === profile.id).map(activity => activity.occurred_at),
  ]

  const promptPurposes = new Set(['welcome', 'morning_prompt', 'morning_followup', 'pending_reminder', 'carry_over'])
  const dyads = includedHouseholds.map(household => {
    const members = profilesByHousehold.get(household.id) ?? []
    const mci = members.find(member => member.role === 'mci_user') ?? null
    const cp = members.find(member => member.role === 'care_partner') ?? null
    const onboardingAt = firstDate([household.created_at, ...members.map(member => member.created_at)]) ?? household.created_at
    const days = daysSince(onboardingAt, now)
    const phase = studyPhase(days)
    const mciLastActive = mci ? latestDate(activityDatesForProfile(mci)) : null
    const cpLastActive = cp ? latestDate(activityDatesForProfile(cp)) : null
    const householdActivityDates = [
      ...events.filter(event => event.household_id === household.id).map(event => event.created_at),
      ...sms.filter(message => message.household_id === household.id).map(message => message.created_at),
      ...plans.filter(plan => plan.household_id === household.id).flatMap(plan => [plan.created_at, plan.confirmed_at].filter(Boolean) as string[]),
      ...activities.filter(activity => activity.household_id === household.id).map(activity => activity.occurred_at),
    ]
    const lastActive = latestDate(householdActivityDates)
    const mciPrompts = sms.filter(message => message.profile_id === mci?.id && message.direction === 'outbound' && promptPurposes.has(message.purpose))
    const mciReplies = sms.filter(message => message.profile_id === mci?.id && message.direction === 'inbound')
    const promptsWithReply = mciPrompts.filter(prompt =>
      mciReplies.some(reply =>
        new Date(reply.created_at) > new Date(prompt.created_at) &&
        new Date(reply.created_at).getTime() - new Date(prompt.created_at).getTime() <= 86_400_000
      )
    ).length
    const mciHours = hoursSince(mciLastActive, now)
    const cpHours = cp ? hoursSince(cpLastActive, now) : 0
    const silentHours = hoursSince(lastActive ?? onboardingAt, now) ?? days * 24

    return {
      id: household.id,
      name: household.name,
      onboardingAt,
      daysSinceOnboarding: days,
      studyPhase: phase,
      mciProfileId: mci?.id ?? null,
      cpProfileId: cp?.id ?? null,
      mciName: mci?.display_name ?? 'No MCI participant',
      cpName: cp?.display_name ?? 'No care partner',
      mciLastActive,
      cpLastActive,
      lastActive,
      mciSmsResponseRate: percent(promptsWithReply, mciPrompts.length),
      statusFlag: statusFlag([mciHours, cpHours]),
      silentHours,
      memberCount: members.length,
    }
  })

  const silentDyads = dyads
    .filter(dyad => dyad.silentHours > 48)
    .sort((a, b) => b.silentHours - a.silentHours)

  const studyArc = dyads.map(dyad => {
    const days = Array.from({ length: 28 }, (_, index) => {
      const day = index + 1
      const dayEvents = events.filter(event => event.household_id === dyad.id && dayDiff(dyad.onboardingAt, event.created_at) + 1 === day)
      const daySms = sms.filter(message => message.household_id === dyad.id && dayDiff(dyad.onboardingAt, message.created_at) + 1 === day)
      const dayPlans = plans.filter(plan => plan.household_id === dyad.id && dayDiff(dyad.onboardingAt, plan.created_at) + 1 === day)
      const dayCompletions = plans.filter(plan => plan.household_id === dyad.id && plan.confirmed_at && dayDiff(dyad.onboardingAt, plan.confirmed_at) + 1 === day)
      return {
        day,
        planLogged: dayPlans.length,
        planCompleted: dayCompletions.length,
        smsReplied: daySms.filter(message => message.direction === 'inbound').length,
        contextViewed: dayEvents.filter(event => event.event_name.endsWith('dashboard_viewed') || event.event_name === 'context_card_viewed').length,
      }
    })
    return { householdId: dyad.id, householdName: dyad.name, studyPhase: dyad.studyPhase, days }
  })

  const eventCounts = new Map<string, number>()
  for (const event of filteredEvents.filter(event => isStudyEvent(event.event_name))) {
    eventCounts.set(event.event_name, (eventCounts.get(event.event_name) ?? 0) + 1)
  }
  const features = [...eventCounts.entries()]
    .map(([name, count]) => ({ name, label: humanEventLabel(name), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const outcomeByDyad = new Map<string, Map<string, OutcomeRow>>()
  for (const outcome of outcomes) {
    if (!outcome.household_id || !householdIds.has(outcome.household_id)) continue
    const key = outcomeKey(outcome.role, outcome.session, outcome.measure_key)
    if (!outcomeByDyad.has(outcome.household_id)) outcomeByDyad.set(outcome.household_id, new Map())
    const current = outcomeByDyad.get(outcome.household_id)!.get(key)
    if (!current || outcome.recorded_at > current.recorded_at) {
      outcomeByDyad.get(outcome.household_id)!.set(key, outcome)
    }
  }

  const outcomeRows = dyads.map(dyad => ({
    householdId: dyad.id,
    householdName: dyad.name,
    studyPhase: dyad.studyPhase,
    mciProfileId: dyad.mciProfileId,
    cpProfileId: dyad.cpProfileId,
    scores: OUTCOME_MEASURES.map(measure => {
      const role = measure.role
      const pre = outcomeByDyad.get(dyad.id)?.get(outcomeKey(role, 'pre', measure.key))
      const post = outcomeByDyad.get(dyad.id)?.get(outcomeKey(role, 'post', measure.key))
      const delta = typeof pre?.score === 'number' && typeof post?.score === 'number'
        ? post.score - pre.score
        : null
      return {
        key: measure.key,
        role,
        label: measure.label,
        pre: pre?.score ?? null,
        post: post?.score ?? null,
        delta,
      }
    }),
  }))

  const householdRows = dyads.map(dyad => {
    const householdPlans = filteredPlans.filter(plan => plan.household_id === dyad.id)
    const householdSms = filteredSms.filter(message => message.household_id === dyad.id)
    return {
      id: dyad.id,
      name: dyad.name,
      studyPhase: dyad.studyPhase,
      members: [dyad.mciName, dyad.cpName].filter(Boolean).join(', '),
      plans: householdPlans.length,
      completionRate: percent(householdPlans.filter(plan => plan.status === 'confirmed').length, householdPlans.length),
      smsReplies: householdSms.filter(message => message.direction === 'inbound').length,
      lastActive: dyad.lastActive,
      statusFlag: dyad.statusFlag,
    }
  })

  const journeys = includedProfiles.map(profile => {
    const profileEvents = events.filter(event => event.profile_id === profile.id)
    const profileSms = sms.filter(message => message.profile_id === profile.id)
    const profilePlans = plans.filter(plan => plan.created_by === profile.id || plan.household_id === profile.household_id)
    const household = dyads.find(dyad => dyad.id === profile.household_id)
    const activityDates = [
      ...profileEvents.map(event => event.created_at),
      ...profileSms.map(message => message.created_at),
      ...profilePlans.map(plan => plan.created_at),
    ].sort()
    return {
      profileId: profile.id,
      name: profile.display_name,
      role: profile.role,
      roleLabel: profileRoleLabel(profile.role),
      household: profile.household_id ? householdNames.get(profile.household_id) ?? 'Unknown' : 'Unlinked',
      studyPhase: household?.studyPhase ?? 'pre',
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

  return {
    filters,
    generatedAt: now.toISOString(),
    households: includedHouseholds.map(household => ({ id: household.id, name: household.name })),
    dyads,
    silentDyads,
    studyArc,
    features,
    outcomeMeasures: OUTCOME_MEASURES,
    outcomeRows,
    householdRows,
    journeys,
    exports: {
      dyads,
      households: householdRows,
      journeys,
      events: filteredEvents,
      sms: filteredSms,
      plans: filteredPlans,
      outcomes,
    },
  }
}
