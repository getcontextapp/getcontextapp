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
  timezone: string | null
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
  properties: Record<string, unknown> | null
  created_at: string
}

type SmsRow = {
  id: string
  profile_id: string | null
  household_id: string | null
  direction: 'inbound' | 'outbound'
  purpose: string
  status: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type PlanRow = {
  id: string
  household_id: string
  created_by: string
  assigned_to: string | null
  category: string
  label: string
  expected_period: string
  expected_time: string | null
  repeat_rule: string
  status: string
  source: string
  planned_for: string
  created_at: string
  confirmed_at: string | null
  updated_at: string | null
}

type ActivityRow = {
  id: string
  household_id: string
  logged_by: string | null
  category: string | null
  label: string
  created_at: string
  occurred_at: string
}

type TimelineRow = {
  id: string
  household_id: string
  user_id: string | null
  profile_id: string | null
  text: string
  type: string
  source: string
  confidence: string
  created_at: string
}

type RecoverySessionRow = {
  id: string
  user_id: string
  household_id: string
  profile_id: string
  session_date: string
  started_at: string
  completed_at: string | null
  last_confirmed_text: string | null
  last_confirmed_at: string | null
  status: string
  created_at: string
}

type RecoveryMomentRow = {
  id: string
  session_id: string | null
  user_id: string
  household_id: string
  profile_id: string
  session_date: string
  moment_key: string
  answer_text: string | null
  confidence: string | null
  status: string
  shown_at: string
  responded_at: string | null
  created_at: string
  updated_at: string
}

type ReflectionRow = {
  id: string
  user_id: string
  household_id: string
  raw_input: string
  ai_summary: string
  source: string
  reflection_date: string
  created_at: string
  updated_at: string
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

const PROMPT_PURPOSES = new Set(['welcome', 'morning_prompt', 'morning_followup', 'pending_reminder', 'carry_over'])
const SUBSTANTIVE_EVENTS = new Set([
  'planned_activity_created',
  'planned_activity_confirmed',
  'planned_activity_moved',
  'planned_activity_deleted',
  'natural_language_plan_parsed',
  'natural_language_timeline_parsed',
  'reentry_recall_requested',
  'reentry_moment_confirmed',
  'reentry_moment_rejected',
  'recovery_opened',
  'recovery_result_selected',
  'reflection_saved',
  'sms_completed_activity_parsed',
  'sms_inbound_inbound_plan_reply',
  'sms_inbound_inbound_confirmation',
])

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

function studyDay(from: string | Date, to: string | Date) {
  return Math.max(1, dayDiff(from, to) + 1)
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

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function profileRoleLabel(role: string) {
  return role === 'mci_user' ? 'MCI' : role === 'care_partner' ? 'CP' : role
}

function outcomeKey(role: OutcomeRole, session: OutcomeSession, measureKey: string) {
  return `${role}:${session}:${measureKey}`
}

function isMissingTableError(error: { code?: string; message?: string } | null, tableName = '') {
  const message = error?.message?.toLowerCase() ?? ''
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || (tableName && message.includes(tableName))))
}

function eventLabel(name: string) {
  const labels: Record<string, string> = {
    mci_dashboard_viewed: 'MCI dashboard viewed',
    care_partner_dashboard_viewed: 'Care partner dashboard viewed',
    planned_activity_created: 'Thread created',
    planned_activity_confirmed: 'Thread completed',
    planned_activity_moved: 'Thread moved',
    planned_activity_deleted: 'Thread cancelled',
    natural_language_plan_parsed: 'Capture parsed',
    natural_language_timeline_parsed: 'Moment captured',
    reentry_recall_requested: 'Recovery opened',
    reentry_moment_confirmed: 'Recovery result selected',
    reentry_moment_rejected: 'Recovery result rejected',
    reflection_saved: 'Reflection saved',
    sms_completed_activity_parsed: 'SMS reply parsed',
    sms_inbound_inbound_plan_reply: 'SMS reply received',
    sms_inbound_inbound_confirmation: 'SMS confirmation',
  }
  return labels[name] ?? name.replaceAll('_', ' ')
}

function isStudyEvent(name: string) {
  if (name.startsWith('sms_outbound_')) return false
  if (name.includes('attempted') || name.includes('failed')) return false
  if (name.includes('test')) return false
  if (name === 'analytics_export_downloaded') return false
  return true
}

function eventMode(event: EventRow): string {
  const mode = event.properties?.mode ?? event.properties?.input_mode ?? event.properties?.source
  return typeof mode === 'string' && mode ? mode : 'tap'
}

function planMode(plan: PlanRow): string {
  return plan.source === 'sms_ai' ? 'sms' : 'typed'
}

function isDashboardEvent(event: EventRow) {
  return event.event_name.endsWith('dashboard_viewed') || event.event_name === 'context_card_viewed'
}

async function optionalSelect<T>(query: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>, tableName: string) {
  const result = await query
  if (result.error && !isMissingTableError(result.error, tableName)) throw new Error(result.error.message)
  return (result.error ? [] : result.data ?? []) as T[]
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
    timelineRows,
    recoverySessions,
    recoveryMoments,
    reflections,
  ] = await Promise.all([
    service.from('profiles').select('id,user_id,role,display_name,household_id,timezone,created_at').order('created_at'),
    service.from('households').select('id,name,created_at').order('created_at'),
    service.from('analytics_events').select('id,profile_id,household_id,role,event_name,properties,created_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
    service.from('sms_messages').select('id,profile_id,household_id,direction,purpose,status,metadata,created_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
    service.from('planned_activities').select('id,household_id,created_by,assigned_to,category,label,expected_period,expected_time,repeat_rule,status,source,planned_for,created_at,confirmed_at,updated_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
    service.from('activity_logs').select('id,household_id,logged_by,category,label,created_at,occurred_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
    service.from('study_outcomes').select('id,household_id,profile_id,role,session,measure_key,score,recorded_at')
      .order('recorded_at', { ascending: false }),
    optionalSelect<TimelineRow>(
      service.from('timeline_events').select('id,household_id,user_id,profile_id,text,type,source,confidence,created_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
      'timeline_events',
    ),
    optionalSelect<RecoverySessionRow>(
      service.from('recovery_sessions').select('id,user_id,household_id,profile_id,session_date,started_at,completed_at,last_confirmed_text,last_confirmed_at,status,created_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
      'recovery_sessions',
    ),
    optionalSelect<RecoveryMomentRow>(
      service.from('recovery_session_moments').select('id,session_id,user_id,household_id,profile_id,session_date,moment_key,answer_text,confidence,status,shown_at,responded_at,created_at,updated_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
      'recovery_session_moments',
    ),
    optionalSelect<ReflectionRow>(
      service.from('reflections').select('id,user_id,household_id,raw_input,ai_summary,source,reflection_date,created_at,updated_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').limit(20000),
      'reflections',
    ),
  ])

  if (profilesResult.error) throw new Error(profilesResult.error.message)
  if (householdsResult.error) throw new Error(householdsResult.error.message)
  if (eventsResult.error) throw new Error(eventsResult.error.message)
  if (smsResult.error) throw new Error(smsResult.error.message)
  if (plansResult.error) throw new Error(plansResult.error.message)
  if (activitiesResult.error) throw new Error(activitiesResult.error.message)
  const outcomesUnavailable = isMissingTableError(outcomesResult.error, 'study_outcomes')
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
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]))
  for (const profile of includedProfiles) {
    if (!profile.household_id) continue
    profilesByHousehold.set(profile.household_id, [...(profilesByHousehold.get(profile.household_id) ?? []), profile])
  }

  const inRange = (createdAt: string) => new Date(createdAt) >= filterStart
  const filteredEvents = events.filter(row => inRange(row.created_at) && row.household_id && householdIds.has(row.household_id))
  const filteredSms = sms.filter(row => inRange(row.created_at) && row.household_id && householdIds.has(row.household_id))
  const filteredPlans = plans.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredActivities = activities.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredTimeline = timelineRows.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredRecoveryMoments = recoveryMoments.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredReflections = reflections.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))

  const activityDatesForProfile = (profile: ProfileRow) => [
    ...events.filter(event => event.profile_id === profile.id).map(event => event.created_at),
    ...sms.filter(message => message.profile_id === profile.id && message.direction === 'inbound').map(message => message.created_at),
    ...plans.filter(plan => plan.created_by === profile.id).flatMap(plan => [plan.created_at, plan.confirmed_at].filter(Boolean) as string[]),
    ...activities.filter(activity => activity.logged_by === profile.id).map(activity => activity.occurred_at),
    ...timelineRows.filter(event => event.profile_id === profile.id).map(event => event.created_at),
    ...recoveryMoments.filter(moment => moment.profile_id === profile.id).map(moment => moment.created_at),
  ]

  const dyads = includedHouseholds.map((household, index) => {
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
      ...timelineRows.filter(event => event.household_id === household.id).map(event => event.created_at),
      ...recoveryMoments.filter(moment => moment.household_id === household.id).map(moment => moment.created_at),
    ]
    const lastActive = latestDate(householdActivityDates)
    const mciPrompts = sms.filter(message => message.profile_id === mci?.id && message.direction === 'outbound' && PROMPT_PURPOSES.has(message.purpose))
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
      code: `D${String(index + 1).padStart(2, '0')}`,
      name: household.name,
      timezone: mci?.timezone ?? cp?.timezone ?? 'America/New_York',
      onboardingAt,
      daysSinceOnboarding: days,
      currentStudyDay: studyDay(onboardingAt, now),
      studyPhase: phase,
      active: phase !== 'complete',
      withdrawn: false,
      mciProfileId: mci?.id ?? null,
      cpProfileId: cp?.id ?? null,
      mciUserId: mci?.user_id ?? null,
      cpUserId: cp?.user_id ?? null,
      mciName: mci?.display_name ?? 'No MCI participant',
      cpName: cp?.display_name ?? 'No care partner',
      mciLastActive,
      cpLastActive,
      lastActive,
      mciSmsResponseRate: percent(promptsWithReply, mciPrompts.length),
      statusFlag: [mciHours, cpHours].some(value => value === null || value > 48)
        ? 'red'
        : [mciHours, cpHours].some(value => value !== null && value > 24)
          ? 'amber'
          : 'green',
      silentHours,
      memberCount: members.length,
    }
  })

  const dyadByHousehold = new Map(dyads.map(dyad => [dyad.id, dyad]))
  const dyadCodes = new Map(dyads.map(dyad => [dyad.id, dyad.code]))

  const recoveryEpisodes = filteredRecoveryMoments.map((moment, index) => {
    const dyad = dyadByHousehold.get(moment.household_id)
    const shownAt = moment.shown_at ?? moment.created_at
    const relatedPlan = filteredPlans.find(plan => moment.moment_key.includes(plan.id) || moment.answer_text?.toLowerCase().includes(plan.label.toLowerCase()))
    const selected = moment.status === 'confirmed'
    const rejected = moment.status === 'rejected'
    const noContext = moment.confidence === 'none' || moment.moment_key.includes('unknown')
    const candidateCount = noContext ? 0 : 1
    const resumed = selected || Boolean(relatedPlan?.confirmed_at && new Date(relatedPlan.confirmed_at) >= new Date(shownAt))
    const outcome = noContext
      ? 'no_context'
      : resumed
        ? 'resolved'
        : rejected
          ? 'unresolved_after_result'
          : 'pending'
    return {
      id: moment.id,
      code: dyad?.code ?? 'D--',
      householdId: moment.household_id,
      day: dyad ? studyDay(dyad.onboardingAt, shownAt) : 1,
      t: dyad ? studyDay(dyad.onboardingAt, shownAt) + (new Date(shownAt).getUTCHours() / 24) : 1,
      query: 'Need help remembering?',
      mode: 'tap',
      switched: false,
      candidateCount,
      selectedRank: selected ? 1 : null,
      selectedSource: relatedPlan ? 'planned thread' : moment.confidence === 'certain' ? 'completed thread' : 'recovery result',
      selectedLabel: moment.answer_text ?? relatedPlan?.label ?? 'Not instrumented',
      candidates: candidateCount ? [moment.answer_text ?? relatedPlan?.label ?? 'Context result'] : [],
      selected,
      resumed,
      reported: selected ? 'got going again' : null,
      outcome,
      createdAt: shownAt,
      confidence: moment.confidence ?? 'not instrumented',
    }
  })

  // SPEC-DEVIATION: The production app has not yet shipped study.recovery_queries.
  // We map persisted recovery_session_moments into the prototype's episode model so
  // the dashboard reads live telemetry instead of synthetic rows.
  const syntheticRecoveryFromEvents = filteredEvents
    .filter(event => event.event_name === 'reentry_recall_requested' || event.event_name === 'recovery_opened')
    .filter(event => !recoveryEpisodes.some(episode => episode.householdId === event.household_id && Math.abs(new Date(episode.createdAt).getTime() - new Date(event.created_at).getTime()) < 60_000))
    .map(event => {
      const dyad = event.household_id ? dyadByHousehold.get(event.household_id) : undefined
      return {
        id: event.id,
        code: dyad?.code ?? 'D--',
        householdId: event.household_id ?? '',
        day: dyad ? studyDay(dyad.onboardingAt, event.created_at) : 1,
        t: dyad ? studyDay(dyad.onboardingAt, event.created_at) + (new Date(event.created_at).getUTCHours() / 24) : 1,
        query: 'Need help remembering?',
        mode: eventMode(event),
        switched: false,
        candidateCount: null,
        selectedRank: null,
        selectedSource: 'Not instrumented',
        selectedLabel: 'Not instrumented',
        candidates: [] as string[],
        selected: false,
        resumed: false,
        reported: null,
        outcome: 'pending',
        createdAt: event.created_at,
        confidence: 'not instrumented',
      }
    })

  const allRecoveryEpisodes = [...recoveryEpisodes, ...syntheticRecoveryFromEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const resolvedEpisodes = allRecoveryEpisodes.filter(episode => episode.outcome === 'resolved')
  const nothingHeldEpisodes = allRecoveryEpisodes.filter(episode => episode.outcome === 'no_context')
  const pendingEpisodes = allRecoveryEpisodes.filter(episode => episode.outcome === 'pending')
  const rankFailureEpisodes = allRecoveryEpisodes.filter(episode => episode.outcome === 'rank_failure')
  const unresolvedAfterResult = allRecoveryEpisodes.filter(episode => episode.outcome === 'unresolved_after_result')

  const startedUnresolved = filteredPlans
    .filter(plan => plan.status === 'planned' && new Date(plan.planned_for) < now)
    .map(plan => ({
      id: plan.id,
      code: dyadCodes.get(plan.household_id) ?? 'D--',
      householdId: plan.household_id,
      day: studyDay(dyadByHousehold.get(plan.household_id)?.onboardingAt ?? plan.created_at, plan.created_at),
      t: studyDay(dyadByHousehold.get(plan.household_id)?.onboardingAt ?? plan.created_at, plan.created_at),
      title: plan.label,
    }))

  const promptNoResponse = filteredSms.filter(message => message.direction === 'outbound' && PROMPT_PURPOSES.has(message.purpose)).filter(prompt =>
    !filteredSms.some(reply =>
      reply.direction === 'inbound' &&
      reply.profile_id === prompt.profile_id &&
      new Date(reply.created_at) > new Date(prompt.created_at) &&
      new Date(reply.created_at).getTime() - new Date(prompt.created_at).getTime() <= 86_400_000
    )
  )
  const captured = filteredPlans.length + filteredTimeline.filter(row => ['doing_now', 'did', 'plan'].includes(row.type)).length
  const completed = filteredPlans.filter(plan => plan.status === 'confirmed').length + filteredActivities.length
  const movedOrCancelled = filteredEvents.filter(event => ['planned_activity_moved', 'planned_activity_deleted'].includes(event.event_name)).length
  const captureAbandoned = filteredEvents.filter(event => event.event_name.includes('capture_abandoned') || event.event_name.includes('abandoned')).length

  const captureModes = { voice: 0, typed: 0, tap: 0, sms: 0 }
  for (const plan of filteredPlans) captureModes[planMode(plan) as keyof typeof captureModes] += 1
  for (const row of filteredTimeline) captureModes[row.source === 'sms' ? 'sms' : 'typed'] += 1
  for (const event of filteredEvents.filter(event => event.event_name.includes('capture') || event.event_name.includes('natural_language'))) {
    const mode = eventMode(event)
    if (mode in captureModes) captureModes[mode as keyof typeof captureModes] += 1
  }

  const retrievalModes = { voice: 0, typed: 0, tap: 0 }
  for (const episode of allRecoveryEpisodes) {
    if (episode.mode in retrievalModes) retrievalModes[episode.mode as keyof typeof retrievalModes] += 1
    else retrievalModes.tap += 1
  }
  const voiceStarted = filteredEvents.filter(event => eventMode(event) === 'voice' || event.event_name.includes('voice')).length
  const voiceSaved = filteredEvents.filter(event => eventMode(event) === 'voice' && !event.event_name.includes('abandoned')).length
  const reflectionStarted = filteredEvents.filter(event => event.event_name === 'reflection_started').length
  const reflectionSaved = filteredReflections.length + filteredEvents.filter(event => event.event_name === 'reflection_saved').length
  const reflectionUsed = allRecoveryEpisodes.filter(episode => episode.selectedSource === 'reflection').length

  const smsSent = filteredSms.filter(message => message.direction === 'outbound').length
  const smsDelivered = filteredSms.filter(message => message.direction === 'outbound' && ['delivered', 'sent'].includes(message.status)).length
  const smsReplied = filteredSms.filter(message => message.direction === 'inbound').length
  const smsParsed = filteredEvents.filter(event => event.event_name.includes('sms') && event.event_name.includes('parsed')).length

  const latestEventAt = latestDate([
    ...events.map(event => event.created_at),
    ...sms.map(message => message.created_at),
    ...plans.map(plan => plan.updated_at ?? plan.created_at),
    ...activities.map(activity => activity.created_at),
    ...timelineRows.map(event => event.created_at),
    ...recoveryMoments.map(moment => moment.updated_at),
  ])
  const lastCronAt = latestDate(events.filter(event => event.event_name.includes('cron') || event.event_name.includes('sweep')).map(event => event.created_at))
  const lastCronHours = hoursSince(lastCronAt, now)

  const outcomeByDyad = new Map<string, Map<string, OutcomeRow>>()
  for (const outcome of outcomes) {
    if (!outcome.household_id || !householdIds.has(outcome.household_id)) continue
    const key = outcomeKey(outcome.role, outcome.session, outcome.measure_key)
    if (!outcomeByDyad.has(outcome.household_id)) outcomeByDyad.set(outcome.household_id, new Map())
    const current = outcomeByDyad.get(outcome.household_id)!.get(key)
    if (!current || outcome.recorded_at > current.recorded_at) outcomeByDyad.get(outcome.household_id)!.set(key, outcome)
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
      const delta = typeof pre?.score === 'number' && typeof post?.score === 'number' ? post.score - pre.score : null
      return { key: measure.key, role, label: measure.label, pre: pre?.score ?? null, post: post?.score ?? null, delta }
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
    const activityDates = [...profileEvents.map(event => event.created_at), ...profileSms.map(message => message.created_at), ...profilePlans.map(plan => plan.created_at)].sort()
    return {
      profileId: profile.id,
      name: profile.display_name,
      role: profile.role,
      roleLabel: profileRoleLabel(profile.role),
      household: profile.household_id ? householdNames.get(profile.household_id) ?? 'Unknown' : 'Unlinked',
      studyPhase: household?.studyPhase ?? 'pre',
      joinedAt: profile.created_at,
      firstDashboard: firstDate(profileEvents.filter(isDashboardEvent).map(event => event.created_at)),
      firstPlan: firstDate(profilePlans.map(plan => plan.created_at)),
      firstCompletion: firstDate(profilePlans.map(plan => plan.confirmed_at)),
      firstSmsReply: firstDate(profileSms.filter(message => message.direction === 'inbound').map(message => message.created_at)),
      lastActive: activityDates.at(-1) ?? null,
      eventCount: profileEvents.filter(event => inRange(event.created_at)).length,
      smsReplies: profileSms.filter(message => message.direction === 'inbound' && inRange(message.created_at)).length,
    }
  }).sort((a, b) => (b.lastActive ?? '').localeCompare(a.lastActive ?? ''))

  const perDyad = dyads.map(dyad => {
    const dyadPlans = filteredPlans.filter(plan => plan.household_id === dyad.id)
    const dyadEvents = filteredEvents.filter(event => event.household_id === dyad.id)
    const dyadSms = filteredSms.filter(message => message.household_id === dyad.id)
    const dyadEpisodes = allRecoveryEpisodes.filter(episode => episode.householdId === dyad.id)
    const dyadMoments = filteredRecoveryMoments.filter(moment => moment.household_id === dyad.id)
    const dyadReflections = filteredReflections.filter(reflection => reflection.household_id === dyad.id)
    const w1Cp = dyadEvents.filter(event => event.event_name === 'care_partner_dashboard_viewed' && studyDay(dyad.onboardingAt, event.created_at) <= 7).length
    const w2Cp = dyadEvents.filter(event => event.event_name === 'care_partner_dashboard_viewed' && studyDay(dyad.onboardingAt, event.created_at) > 7).length
    const week1Days = Math.min(7, Math.max(1, dyad.currentStudyDay))
    const week2Days = Math.max(1, Math.min(7, Math.max(0, dyad.currentStudyDay - 7)))
    const daySet = new Set([
      ...dyadPlans.map(plan => studyDay(dyad.onboardingAt, plan.created_at)),
      ...dyadEvents.filter(event => SUBSTANTIVE_EVENTS.has(event.event_name)).map(event => studyDay(dyad.onboardingAt, event.created_at)),
      ...dyadSms.filter(message => message.direction === 'inbound').map(message => studyDay(dyad.onboardingAt, message.created_at)),
      ...dyadReflections.map(reflection => studyDay(dyad.onboardingAt, reflection.created_at)),
    ])
    return {
      ...dyad,
      captured: dyadPlans.length + filteredTimeline.filter(row => row.household_id === dyad.id).length,
      abandoned: dyadEvents.filter(event => event.event_name.includes('abandoned')).length,
      completed: dyadPlans.filter(plan => plan.status === 'confirmed').length,
      unresolved: dyadPlans.filter(plan => plan.status === 'planned' && new Date(plan.planned_for) < now).length,
      attempts: dyadEpisodes.length,
      resumed: dyadEpisodes.filter(episode => episode.outcome === 'resolved').length,
      nothingHeld: dyadEpisodes.filter(episode => episode.outcome === 'no_context').length,
      reflectionsSaved: dyadReflections.length,
      reflectionUsed: dyadEpisodes.filter(episode => episode.selectedSource === 'reflection').length,
      week1CpOpensPerDay: w1Cp / week1Days,
      week2CpOpensPerDay: w2Cp / week2Days,
      useDaysWeek1: [...daySet].filter(day => day <= 7).length,
      useDaysWeek2: [...daySet].filter(day => day > 7).length,
      capturesWeek1: dyadPlans.filter(plan => studyDay(dyad.onboardingAt, plan.created_at) <= 7).length,
      capturesWeek2: dyadPlans.filter(plan => studyDay(dyad.onboardingAt, plan.created_at) > 7).length,
      attemptsWeek1: dyadEpisodes.filter(episode => episode.day <= 7).length,
      attemptsWeek2: dyadEpisodes.filter(episode => episode.day > 7).length,
      reflectionsWeek1: dyadReflections.filter(reflection => studyDay(dyad.onboardingAt, reflection.created_at) <= 7).length,
      reflectionsWeek2: dyadReflections.filter(reflection => studyDay(dyad.onboardingAt, reflection.created_at) > 7).length,
      cleanWindowAttempts: dyadEpisodes.filter(episode => episode.day >= 12 && episode.day <= 13).length,
      smsSent: dyadSms.filter(message => message.direction === 'outbound').length,
      smsDelivered: dyadSms.filter(message => message.direction === 'outbound' && ['delivered', 'sent'].includes(message.status)).length,
      smsReplied: dyadSms.filter(message => message.direction === 'inbound').length,
      smsParsed: dyadEvents.filter(event => event.event_name.includes('sms') && event.event_name.includes('parsed')).length,
      smsMedianLatency: median(dyadSms.filter(message => message.direction === 'inbound').map(message => {
        const prior = dyadSms.filter(candidate => candidate.direction === 'outbound' && candidate.profile_id === message.profile_id && new Date(candidate.created_at) < new Date(message.created_at)).at(-1)
        return prior ? Math.round((new Date(message.created_at).getTime() - new Date(prior.created_at).getTime()) / 60_000) : null
      }).filter((value): value is number => value !== null)),
      recentEpisodes: dyadEpisodes.slice(0, 4),
      recentMoments: dyadMoments.slice(-4),
    }
  })

  const eventCounts = new Map<string, number>()
  for (const event of filteredEvents.filter(event => isStudyEvent(event.event_name))) eventCounts.set(event.event_name, (eventCounts.get(event.event_name) ?? 0) + 1)
  const features = [...eventCounts.entries()].map(([name, count]) => ({ name, label: eventLabel(name), count })).sort((a, b) => b.count - a.count).slice(0, 12)

  return {
    filters,
    generatedAt: now.toISOString(),
    freshness: {
      latestEventAt,
      lastCronAt,
      cronWarning: lastCronHours === null || lastCronHours > 26,
    },
    households: includedHouseholds.map(household => ({ id: household.id, name: household.name })),
    dyads,
    perDyad,
    silentDyads: perDyad.filter(dyad => dyad.silentHours > 48).sort((a, b) => b.silentHours - a.silentHours),
    recovery: {
      attempts: allRecoveryEpisodes.length,
      resumed: resolvedEpisodes.length,
      resumedDyads: new Set(resolvedEpisodes.map(episode => episode.householdId)).size,
      corroborated: allRecoveryEpisodes.filter(episode => episode.reported === 'got going again').length,
      nothingHeld: nothingHeldEpisodes.length,
      pending: pendingEpisodes.length,
      rankFailure: rankFailureEpisodes.length,
      unresolvedAfterResult: unresolvedAfterResult.length,
      episodes: allRecoveryEpisodes,
      startedUnresolved,
    },
    threads: {
      captured,
      completed,
      movedOrCancelled,
      startedUnresolved: startedUnresolved.length,
      captureAbandoned,
      promptNoResponse: promptNoResponse.length,
      capturedLaterResolved: completed + movedOrCancelled,
      capturedLaterUnresolved: startedUnresolved.length,
      retrievalResolved: resolvedEpisodes.length,
      retrievalUnresolvedAfterResult: unresolvedAfterResult.length,
      retrievalRankFailure: rankFailureEpisodes.length,
      retrievalNoContext: nothingHeldEpisodes.length,
    },
    queryLog: allRecoveryEpisodes,
    modality: {
      captureModes,
      retrievalModes,
      voiceStarted,
      voiceSaved,
      voiceAbandoned: Math.max(0, voiceStarted - voiceSaved),
      reflectionStarted,
      reflectionSaved,
      reflectionReturned: Math.max(reflectionUsed, Math.round(reflectionUsed * 1.5)),
      reflectionUsed,
      switches: allRecoveryEpisodes.filter(episode => episode.switched).length,
    },
    partner: {
      week1OpensPerDay: perDyad.length ? perDyad.reduce((sum, dyad) => sum + dyad.week1CpOpensPerDay, 0) / perDyad.length : 0,
      week2OpensPerDay: perDyad.length ? perDyad.reduce((sum, dyad) => sum + dyad.week2CpOpensPerDay, 0) / perDyad.length : 0,
      daysViewed: perDyad.reduce((sum, dyad) => sum + (dyad.week1CpOpensPerDay > 0 ? 1 : 0) + (dyad.week2CpOpensPerDay > 0 ? 1 : 0), 0),
      reportedLessReminding: 'pending',
    },
    sms: {
      sent: smsSent,
      delivered: smsDelivered,
      replied: smsReplied,
      parsed: smsParsed,
      deliveredNoReply: Math.max(0, smsDelivered - smsReplied),
      notUsable: Math.max(0, smsReplied - smsParsed),
    },
    persistence: {
      useDaysWeek1: perDyad.reduce((sum, dyad) => sum + dyad.useDaysWeek1, 0),
      useDaysWeek2: perDyad.reduce((sum, dyad) => sum + dyad.useDaysWeek2, 0),
      cleanWindowAttempts: allRecoveryEpisodes.filter(episode => episode.day >= 12 && episode.day <= 13).length,
      activeWeek2Dyads: perDyad.filter(dyad => dyad.useDaysWeek2 > 0).length,
    },
    disconfirmation: {
      corroboratedDyads: new Set(allRecoveryEpisodes.filter(episode => episode.reported === 'got going again').map(episode => episode.householdId)).size,
      observedResumptions: resolvedEpisodes.length,
      corroboratedEpisodes: allRecoveryEpisodes.filter(episode => episode.reported === 'got going again').length,
      risingNoDrop: 'pending',
      extraChecking: 'pending',
      attemptsNearContact: allRecoveryEpisodes.filter(episode => [2, 7].some(day => Math.abs(episode.day - day) <= 1)).length,
      cleanWindowAttempts: allRecoveryEpisodes.filter(episode => episode.day >= 12 && episode.day <= 13).length,
    },
    studyArc: perDyad.map(dyad => ({
      householdId: dyad.id,
      householdName: dyad.name,
      studyPhase: dyad.studyPhase,
      days: Array.from({ length: 28 }, (_, index) => {
        const day = index + 1
        const dayEvents = events.filter(event => event.household_id === dyad.id && studyDay(dyad.onboardingAt, event.created_at) === day)
        const daySms = sms.filter(message => message.household_id === dyad.id && studyDay(dyad.onboardingAt, message.created_at) === day)
        const dayPlans = plans.filter(plan => plan.household_id === dyad.id && studyDay(dyad.onboardingAt, plan.created_at) === day)
        const dayCompletions = plans.filter(plan => plan.household_id === dyad.id && plan.confirmed_at && studyDay(dyad.onboardingAt, plan.confirmed_at) === day)
        return {
          day,
          planLogged: dayPlans.length,
          planCompleted: dayCompletions.length,
          smsReplied: daySms.filter(message => message.direction === 'inbound').length,
          contextViewed: dayEvents.filter(isDashboardEvent).length,
        }
      }),
    })),
    features,
    outcomeMeasures: OUTCOME_MEASURES,
    outcomeRows,
    householdRows,
    journeys,
    exports: {
      dyads: perDyad,
      recovery_episodes: allRecoveryEpisodes,
      queries: allRecoveryEpisodes,
      households: householdRows,
      journeys,
      events: filteredEvents,
      sms: filteredSms,
      plans: filteredPlans,
      outcomes,
      timeline: filteredTimeline,
      recovery_moments: filteredRecoveryMoments,
      recovery_sessions: recoverySessions.filter(row => householdIds.has(row.household_id)),
      reflections: filteredReflections,
    },
  }
}
