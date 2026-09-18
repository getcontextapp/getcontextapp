import { createServiceClient } from '@/lib/supabase-server'
import { cohortForHouseholdName } from '@/lib/pilot-cohorts'
import { accountModeForMembers } from '@/lib/account-mode'
import { chooseResearchFollowupRecipient } from '@/lib/research-followup'
import { getLocalDateKey } from '@/lib/dates'
import { ANALYTICS_PAGE_SIZE, matchPromptReplies, paginatedSelect, type AnalyticsQueryError } from '@/lib/pilot-analytics-helpers'

export interface AnalyticsFilters {
  days: number
  householdId: string
  role: string
}

const STUDY_DAYS = 28

type ProfileRow = {
  id: string
  user_id: string
  role: string
  display_name: string
  phone_e164: string | null
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
  series_id: string | null
  status: string
  source: string
  planned_for: string
  created_at: string
  confirmed_at: string | null
  confirmed_activity_log_id: string | null
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

type FeatureFlagRow = {
  id: string
  household_id: string
  feature_key: string
  enabled: boolean
  created_at: string
  updated_at: string
}

type CalendarConnectionRow = {
  id: string
  household_id: string
  owner_profile_id: string
  connected_by_profile_id: string | null
  provider: string
  provider_account_email: string | null
  status: string
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

type CalendarEventRow = {
  id: string
  household_id: string
  owner_profile_id: string
  connection_id: string
  provider: string
  provider_event_id: string
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  status: string
  hidden_at: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

type NotificationEventRow = {
  id: string
  profile_id: string
  household_id: string | null
  category: string
  channels: string[] | null
  delivery_status: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  sent_at: string | null
  created_at: string
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
const NUDGE_PURPOSES = new Set([
  'morning_prompt', 'morning_followup', 'pending_reminder', 'due_reminder',
  'carry_over', 'daily_summary', 'weekly_summary',
])
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

function medianDisplay(values: number[]) {
  const value = median(values)
  return value === null ? 'Not instrumented' : value
}

function week2Value<T>(currentStudyDay: number, value: T) {
  return currentStudyDay > 7 ? value : null
}

function profileRoleLabel(role: string) {
  return role === 'mci_user' ? 'MCI' : role === 'care_partner' ? 'CP' : role
}

function outcomeKey(role: OutcomeRole, session: OutcomeSession, measureKey: string) {
  return `${role}:${session}:${measureKey}`
}

function isMissingTableError(error: { code?: string; message?: string } | null, tableName = '') {
  const message = error?.message?.toLowerCase() ?? ''
  return Boolean(error && (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (tableName && message.includes('could not find the table') && message.includes(tableName.toLowerCase()))
  ))
}

function eventLabel(name: string) {
  const labels: Record<string, string> = {
    mci_dashboard_viewed: 'MCI dashboard viewed',
    care_partner_dashboard_viewed: 'Care partner dashboard viewed',
    planned_activity_created: 'Plan added',
    planned_activity_confirmed: 'Plan completed',
    planned_activity_moved: 'Plan moved',
    planned_activity_deleted: 'Plan deleted',
    natural_language_plan_parsed: 'Capture parsed',
    natural_language_timeline_parsed: 'Moment captured',
    reentry_recall_requested: 'Memory help opened',
    reentry_moment_confirmed: 'Memory help confirmed',
    reentry_moment_rejected: 'Memory help rejected',
    reentry_session_exhausted: 'Memory help completed',
    recovery_opened: 'Memory help opened',
    recovery_result_selected: 'Memory help answer selected',
    reflection_saved: 'Reflection saved',
    sms_completed_activity_parsed: 'SMS reply parsed',
    sms_inbound_inbound_plan_reply: 'SMS reply received',
    sms_inbound_inbound_confirmation: 'SMS confirmation',
    calendar_event_synced: 'Calendar item synced',
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
  return plan.source === 'sms_ai' ? 'sms' : 'unknown'
}

function isDashboardEvent(event: EventRow) {
  return event.event_name.endsWith('dashboard_viewed') || event.event_name === 'context_card_viewed'
}

type DataIssue = { dataset: string; code: string; message: string }

async function optionalPaginatedSelect<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: AnalyticsQueryError | null }>,
  tableName: string,
  issues: DataIssue[],
) {
  const result = await paginatedSelect<T>(queryPage)
  if (result.error) {
    issues.push({
      dataset: tableName,
      code: result.error.code ?? 'unknown',
      message: isMissingTableError(result.error, tableName) ? 'Dataset is not installed.' : result.error.message,
    })
    return []
  }
  return result.data ?? []
}

export async function loadPilotAnalytics(filters: AnalyticsFilters) {
  const service = createServiceClient()
  const now = new Date()
  const filterStart = new Date(now.getTime() - filters.days * 86_400_000)
  const historyStart = new Date(now.getTime() - 120 * 86_400_000)
  const dataIssues: DataIssue[] = []

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
    featureFlags,
    calendarConnections,
    calendarEvents,
    notificationEvents,
  ] = await Promise.all([
    paginatedSelect<ProfileRow>((from, to) => service.from('profiles').select('id,user_id,role,display_name,phone_e164,household_id,timezone,created_at').order('created_at').order('id').range(from, to)),
    paginatedSelect<HouseholdRow>((from, to) => service.from('households').select('id,name,created_at').order('created_at').order('id').range(from, to)),
    paginatedSelect<EventRow>((from, to) => service.from('analytics_events').select('id,profile_id,household_id,role,event_name,properties,created_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to)),
    paginatedSelect<SmsRow>((from, to) => service.from('sms_messages').select('id,profile_id,household_id,direction,purpose,status,metadata,created_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to)),
    paginatedSelect<PlanRow>((from, to) => service.from('planned_activities').select('id,household_id,created_by,assigned_to,category,label,expected_period,expected_time,repeat_rule,series_id,status,source,planned_for,created_at,confirmed_at,confirmed_activity_log_id,updated_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to)),
    paginatedSelect<ActivityRow>((from, to) => service.from('activity_logs').select('id,household_id,logged_by,category,label,created_at,occurred_at')
      .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to)),
    paginatedSelect<OutcomeRow>((from, to) => service.from('study_outcomes').select('id,household_id,profile_id,role,session,measure_key,score,recorded_at')
      .order('recorded_at', { ascending: false }).order('id').range(from, to)),
    optionalPaginatedSelect<TimelineRow>(
      (from, to) => service.from('timeline_events').select('id,household_id,user_id,profile_id,text,type,source,confidence,created_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to),
      'timeline_events', dataIssues,
    ),
    optionalPaginatedSelect<RecoverySessionRow>(
      (from, to) => service.from('recovery_sessions').select('id,user_id,household_id,profile_id,session_date,started_at,completed_at,last_confirmed_text,last_confirmed_at,status,created_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to),
      'recovery_sessions', dataIssues,
    ),
    optionalPaginatedSelect<RecoveryMomentRow>(
      (from, to) => service.from('recovery_session_moments').select('id,session_id,user_id,household_id,profile_id,session_date,moment_key,answer_text,confidence,status,shown_at,responded_at,created_at,updated_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to),
      'recovery_session_moments', dataIssues,
    ),
    optionalPaginatedSelect<ReflectionRow>(
      (from, to) => service.from('reflections').select('id,user_id,household_id,raw_input,ai_summary,source,reflection_date,created_at,updated_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to),
      'reflections', dataIssues,
    ),
    optionalPaginatedSelect<FeatureFlagRow>(
      (from, to) => service.from('household_feature_flags').select('id,household_id,feature_key,enabled,created_at,updated_at')
        .order('created_at').order('id').range(from, to),
      'household_feature_flags', dataIssues,
    ),
    optionalPaginatedSelect<CalendarConnectionRow>(
      (from, to) => service.from('calendar_connections').select('id,household_id,owner_profile_id,connected_by_profile_id,provider,provider_account_email,status,last_synced_at,created_at,updated_at')
        .order('created_at').order('id').range(from, to),
      'calendar_connections', dataIssues,
    ),
    optionalPaginatedSelect<CalendarEventRow>(
      (from, to) => service.from('calendar_events').select('id,household_id,owner_profile_id,connection_id,provider,provider_event_id,title,starts_at,ends_at,all_day,status,hidden_at,synced_at,created_at,updated_at')
        .gte('starts_at', historyStart.toISOString()).order('starts_at').order('id').range(from, to),
      'calendar_events', dataIssues,
    ),
    optionalPaginatedSelect<NotificationEventRow>(
      (from, to) => service.from('notification_events').select('id,profile_id,household_id,category,channels,delivery_status,metadata,sent_at,created_at')
        .gte('created_at', historyStart.toISOString()).order('created_at').order('id').range(from, to),
      'notification_events', dataIssues,
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
  for (const profile of includedProfiles) {
    if (!profile.household_id) continue
    profilesByHousehold.set(profile.household_id, [...(profilesByHousehold.get(profile.household_id) ?? []), profile])
  }

  const inRange = (createdAt: string) => new Date(createdAt) >= filterStart
  const filteredEvents = events.filter(row => inRange(row.created_at) && row.household_id && householdIds.has(row.household_id))
  const filteredSms = sms.filter(row => inRange(row.created_at) && row.household_id && householdIds.has(row.household_id))
  const filteredPlans = plans.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredPlanCompletions = plans.filter(row => row.confirmed_at && inRange(row.confirmed_at) && householdIds.has(row.household_id))
  const filteredActivities = activities.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredTimeline = timelineRows.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredRecoveryMoments = recoveryMoments.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredReflections = reflections.filter(row => inRange(row.created_at) && householdIds.has(row.household_id))
  const filteredFeatureFlags = featureFlags.filter(row => householdIds.has(row.household_id))
  const filteredCalendarConnections = calendarConnections.filter(row => householdIds.has(row.household_id))
  const filteredCalendarEvents = calendarEvents.filter(row =>
    inRange(row.starts_at) &&
    householdIds.has(row.household_id) &&
    row.status !== 'cancelled' &&
    !row.hidden_at
  )
  const filteredNotificationEvents = notificationEvents.filter(row =>
    inRange(row.created_at) && row.household_id && householdIds.has(row.household_id)
  )

  const activityDatesForProfile = (profile: ProfileRow) => [
    ...events.filter(event => event.profile_id === profile.id).map(event => event.created_at),
    ...sms.filter(message => message.profile_id === profile.id && message.direction === 'inbound').map(message => message.created_at),
    ...plans.filter(plan => plan.created_by === profile.id).flatMap(plan => [plan.created_at, plan.confirmed_at].filter(Boolean) as string[]),
    ...activities.filter(activity => activity.logged_by === profile.id).map(activity => activity.occurred_at),
    ...timelineRows.filter(event => event.profile_id === profile.id).map(event => event.created_at),
    ...recoveryMoments.filter(moment => moment.profile_id === profile.id).map(moment => moment.created_at),
  ]

  const cohortSequences = new Map<string, number>()
  const dyads = includedHouseholds.map((household) => {
    const members = profilesByHousehold.get(household.id) ?? []
    const mci = members.find(member => member.role === 'mci_user') ?? null
    const cp = members.find(member => member.role === 'care_partner') ?? null
    const followupRecipient = chooseResearchFollowupRecipient(members)
    const onboardingAt = firstDate([household.created_at, ...members.map(member => member.created_at)]) ?? household.created_at
    const days = daysSince(onboardingAt, now)
    const phase = studyPhase(days)
    const householdFeatureFlags = filteredFeatureFlags.filter(flag => flag.household_id === household.id)
    const cohortInfo = cohortForHouseholdName(household.name)
    const nextSequence = (cohortSequences.get(cohortInfo.cohort) ?? 0) + 1
    cohortSequences.set(cohortInfo.cohort, nextSequence)
    const householdCalendarConnections = filteredCalendarConnections.filter(connection => connection.household_id === household.id)
    const householdCalendarEvents = filteredCalendarEvents.filter(event => event.household_id === household.id)
    const upcomingCalendarEvents = householdCalendarEvents
      .filter(event => new Date(event.starts_at) >= now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const nextCalendar = upcomingCalendarEvents[0] ?? null
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
    const mciPromptMatches = matchPromptReplies(sms.filter(message => message.profile_id === mci?.id), PROMPT_PURPOSES)
    const mciHours = hoursSince(mciLastActive, now)
    const cpHours = cp ? hoursSince(cpLastActive, now) : 0
    const silentHours = hoursSince(lastActive ?? onboardingAt, now) ?? days * 24
    return {
      id: household.id,
      cohort: cohortInfo.cohort,
      code: `${cohortInfo.prefix}${String(nextSequence).padStart(2, '0')}`,
      label: household.name,
      displayLabel: `${cohortInfo.prefix}${String(nextSequence).padStart(2, '0')} · ${household.name}`,
      name: household.name,
      householdCreatedAt: household.created_at,
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
      cpPhoneLast4: cp?.phone_e164?.slice(-4) ?? null,
      followupProfileId: followupRecipient?.id ?? null,
      followupName: followupRecipient?.display_name ?? 'No participant',
      followupPhoneLast4: followupRecipient?.phone_e164?.slice(-4) ?? null,
      followupRole: followupRecipient?.role ?? null,
      accountMode: accountModeForMembers(members),
      researchFollowupDays: [...new Set([
        ...sms
          .filter(message =>
            message.household_id === household.id &&
            message.profile_id === followupRecipient?.id &&
            message.direction === 'outbound' &&
            message.purpose === 'research_followup' &&
            message.status !== 'failed'
          )
          .map(message => Number(message.metadata?.milestone_day)),
        ...events
          .filter(event =>
            event.household_id === household.id &&
            event.profile_id === followupRecipient?.id &&
            event.event_name === 'research_followup_contacted'
          )
          .map(event => Number(event.properties?.milestone_day)),
      ])].filter(day => Number.isInteger(day)),
      mciLastActive,
      cpLastActive,
      lastActive,
      mciSmsResponseRate: percent(mciPromptMatches.answered, mciPromptMatches.prompts),
      pilotPreviewEnabled: householdFeatureFlags.find(flag => flag.feature_key === 'pilot_preview')?.enabled ?? true,
      calendarSyncEnabled: householdFeatureFlags.find(flag => flag.feature_key === 'calendar_sync')?.enabled ?? true,
      calendarConnected: householdCalendarConnections.some(connection => connection.status === 'active'),
      calendarLastSyncedAt: latestDate(householdCalendarConnections.map(connection => connection.last_synced_at ?? connection.updated_at)),
      calendarEventsInWindow: householdCalendarEvents.length,
      calendarUpcomingCount: upcomingCalendarEvents.length,
      nextCalendarTitle: nextCalendar?.title ?? null,
      nextCalendarAt: nextCalendar?.starts_at ?? null,
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

  const recoveryEpisodes = filteredRecoveryMoments.map((moment) => {
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
      code: dyad?.code ?? '--',
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
        code: dyad?.code ?? '--',
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
    .filter(plan => {
      const timezone = dyadByHousehold.get(plan.household_id)?.timezone ?? 'America/New_York'
      return plan.status === 'planned' && plan.planned_for < getLocalDateKey(now, timezone)
    })
    .map(plan => ({
      id: plan.id,
      code: dyadCodes.get(plan.household_id) ?? '--',
      householdId: plan.household_id,
      day: studyDay(dyadByHousehold.get(plan.household_id)?.onboardingAt ?? plan.created_at, plan.created_at),
      t: studyDay(dyadByHousehold.get(plan.household_id)?.onboardingAt ?? plan.created_at, plan.created_at),
      title: plan.label,
    }))

  const promptMatches = matchPromptReplies(filteredSms, PROMPT_PURPOSES)
  const promptNoResponse = filteredSms.filter(message =>
    message.direction === 'outbound' &&
    PROMPT_PURPOSES.has(message.purpose) &&
    !promptMatches.matchedPromptIds.has(message.id)
  )
  const captured = filteredPlans.length + filteredTimeline.filter(row => ['doing_now', 'did', 'plan'].includes(row.type)).length
  const linkedActivityIds = new Set(plans.map(plan => plan.confirmed_activity_log_id).filter((id): id is string => Boolean(id)))
  const standaloneCompleted = filteredActivities.filter(activity => !linkedActivityIds.has(activity.id)).length
  const completed = filteredPlanCompletions.length + standaloneCompleted
  const movedOrCancelled = filteredEvents.filter(event => ['planned_activity_moved', 'planned_activity_deleted'].includes(event.event_name)).length
  const captureAbandoned = filteredEvents.filter(event => event.event_name.includes('capture_abandoned') || event.event_name.includes('abandoned')).length

  const captureModes = { voice: 0, typed: 0, tap: 0, sms: 0, unknown: 0 }
  for (const plan of filteredPlans) captureModes[planMode(plan) as keyof typeof captureModes] += 1
  for (const row of filteredTimeline) captureModes[row.source === 'sms' ? 'sms' : 'typed'] += 1

  const retrievalModes = { voice: 0, typed: 0, tap: 0 }
  for (const episode of allRecoveryEpisodes) {
    if (episode.mode in retrievalModes) retrievalModes[episode.mode as keyof typeof retrievalModes] += 1
    else retrievalModes.tap += 1
  }
  const voiceStarted = filteredEvents.filter(event => event.event_name === 'voice_input_started').length
  const voiceSaved = filteredEvents.filter(event => event.event_name === 'voice_input_completed').length
  const reflectionStarted = filteredEvents.filter(event => event.event_name === 'reflection_started').length
  const reflectionSaved = filteredReflections.length
  const reflectionUsed = allRecoveryEpisodes.filter(episode => episode.selectedSource === 'reflection').length

  const smsSent = filteredSms.filter(message => message.direction === 'outbound').length
  const smsDelivered = filteredSms.filter(message => message.direction === 'outbound' && message.status === 'delivered').length
  const smsFailed = filteredSms.filter(message => message.direction === 'outbound' && message.status === 'failed').length
  const smsPending = filteredSms.filter(message => message.direction === 'outbound' && ['queued', 'sent'].includes(message.status)).length
  const smsDeliveryUnconfirmed = filteredSms.filter(message => message.direction === 'outbound' && message.status === 'twiml_reply').length
  const smsReplied = filteredSms.filter(message => message.direction === 'inbound').length
  const smsParsed = filteredEvents.filter(event => event.event_name.includes('sms') && event.event_name.includes('parsed')).length

  const latestEventAt = latestDate([
    ...events.map(event => event.created_at),
    ...sms.map(message => message.created_at),
    ...plans.map(plan => plan.updated_at ?? plan.created_at),
    ...activities.map(activity => activity.created_at),
    ...timelineRows.map(event => event.created_at),
    ...recoveryMoments.map(moment => moment.updated_at),
    ...calendarEvents.map(event => event.updated_at ?? event.synced_at ?? event.starts_at),
  ])
  const lastCronAt = latestDate(events.filter(event => event.event_name.includes('cron') || event.event_name.includes('sweep') || event.event_name.endsWith('_sms_attempted')).map(event => event.created_at))
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
      return {
        key: measure.key,
        role,
        profileId: role === 'mci' ? dyad.mciProfileId : dyad.cpProfileId,
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
      code: dyad.code,
      name: dyad.name,
      studyPhase: dyad.studyPhase,
      members: [dyad.mciName, dyad.cpName].filter(Boolean).join(', '),
      plans: householdPlans.length,
      completionRate: percent(householdPlans.filter(plan => plan.status === 'confirmed').length, householdPlans.length),
      smsReplies: householdSms.filter(message => message.direction === 'inbound').length,
      lastActive: dyad.lastActive,
      statusFlag: dyad.statusFlag,
      pilotPreviewEnabled: dyad.pilotPreviewEnabled,
      calendarConnected: dyad.calendarConnected,
      calendarUpcomingCount: dyad.calendarUpcomingCount,
      nextCalendarAt: dyad.nextCalendarAt,
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

  const basePerDyad = dyads.map(dyad => {
    const dyadPlans = filteredPlans.filter(plan => plan.household_id === dyad.id)
    const dyadEvents = filteredEvents.filter(event => event.household_id === dyad.id)
    const dyadSms = filteredSms.filter(message => message.household_id === dyad.id)
    const dyadEpisodes = allRecoveryEpisodes.filter(episode => episode.householdId === dyad.id)
    const dyadMoments = filteredRecoveryMoments.filter(moment => moment.household_id === dyad.id)
    const dyadReflections = filteredReflections.filter(reflection => reflection.household_id === dyad.id)
    const dyadNotifications = filteredNotificationEvents.filter(event => event.household_id === dyad.id)
    const dyadPlanCompletions = filteredPlanCompletions.filter(plan => plan.household_id === dyad.id)
    const dyadCapturedPlans = dyadPlans.filter(plan => !plan.series_id || plan.series_id === plan.id)
    const dyadStandaloneActivities = filteredActivities.filter(activity => activity.household_id === dyad.id && !linkedActivityIds.has(activity.id))
    const dyadNudges = dyadSms.filter(message => message.direction === 'outbound' && NUDGE_PURPOSES.has(message.purpose))
    const promptMatches = matchPromptReplies(dyadSms, PROMPT_PURPOSES)
    const nudgeResponsesWithin2h = dyadNudges.filter(nudge => {
      const start = new Date(nudge.created_at).getTime()
      const end = start + 2 * 60 * 60 * 1000
      return dyadSms.some(message => message.direction === 'inbound' && message.profile_id === nudge.profile_id && new Date(message.created_at).getTime() > start && new Date(message.created_at).getTime() <= end) ||
        dyadEvents.some(event => event.role === 'mci_user' && SUBSTANTIVE_EVENTS.has(event.event_name) && new Date(event.created_at).getTime() > start && new Date(event.created_at).getTime() <= end)
    }).length
    const pushSent = dyadNotifications.filter(event => event.sent_at && event.channels?.includes('push')).length
    const notificationDays = new Set([
      ...dyadNudges.map(message => dateKey(message.created_at)),
      ...dyadNotifications.filter(event => event.sent_at && event.channels?.includes('push')).map(event => dateKey(event.sent_at!)),
    ]).size
    const featureCounts = new Map<string, number>()
    for (const event of dyadEvents.filter(event => isStudyEvent(event.event_name))) {
      featureCounts.set(event.event_name, (featureCounts.get(event.event_name) ?? 0) + 1)
    }
    const captureParsed = dyadEvents.filter(event => ['natural_language_plan_parsed', 'natural_language_timeline_parsed'].includes(event.event_name)).length
    const captureSaved = dyadEvents.filter(event => ['natural_language_plan_saved', 'natural_language_exact_note_saved', 'reflection_saved'].includes(event.event_name)).length
    const captureClarified = dyadEvents.filter(event => event.event_name === 'natural_language_clarification_requested').length
    const captureFallback = dyadEvents.filter(event => event.event_name === 'natural_language_plan_parsed' && event.properties?.used_custom_fallback === true).length
    const captureCorrected = dyadEvents.filter(event => event.event_name === 'natural_language_plan_saved' && event.properties?.was_corrected === true).length
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
      completed: dyadPlanCompletions.length + dyadStandaloneActivities.length,
      unresolved: dyadPlans.filter(plan => plan.status === 'planned' && plan.planned_for < getLocalDateKey(now, dyad.timezone)).length,
      attempts: dyadEpisodes.length,
      resumed: dyadEpisodes.filter(episode => episode.outcome === 'resolved').length,
      nothingHeld: dyadEpisodes.filter(episode => episode.outcome === 'no_context').length,
      reflectionsSaved: dyadReflections.length,
      reflectionUsed: dyadEpisodes.filter(episode => episode.selectedSource === 'reflection').length,
      week1CpOpensPerDay: w1Cp / week1Days,
      week2CpOpensPerDay: week2Value(dyad.currentStudyDay, w2Cp / week2Days),
      useDaysWeek1: [...daySet].filter(day => day <= 7).length,
      useDaysWeek2: week2Value(dyad.currentStudyDay, [...daySet].filter(day => day > 7).length),
      capturesWeek1: dyadPlans.filter(plan => studyDay(dyad.onboardingAt, plan.created_at) <= 7).length,
      capturesWeek2: week2Value(dyad.currentStudyDay, dyadPlans.filter(plan => studyDay(dyad.onboardingAt, plan.created_at) > 7).length),
      attemptsWeek1: dyadEpisodes.filter(episode => episode.day <= 7).length,
      attemptsWeek2: week2Value(dyad.currentStudyDay, dyadEpisodes.filter(episode => episode.day > 7).length),
      reflectionsWeek1: dyadReflections.filter(reflection => studyDay(dyad.onboardingAt, reflection.created_at) <= 7).length,
      reflectionsWeek2: week2Value(dyad.currentStudyDay, dyadReflections.filter(reflection => studyDay(dyad.onboardingAt, reflection.created_at) > 7).length),
      cleanWindowAttempts: dyadEpisodes.filter(episode => episode.day >= 12 && episode.day <= 13).length,
      daysDark: Math.max(0, dyad.currentStudyDay - Math.max(0, ...[...daySet])),
      useTrend: Array.from({ length: Math.min(STUDY_DAYS, Math.max(1, dyad.currentStudyDay)) }, (_, index) => {
        const day = index + 1
        return dyadPlans.filter(plan => studyDay(dyad.onboardingAt, plan.created_at) === day).length +
          dyadEvents.filter(event => SUBSTANTIVE_EVENTS.has(event.event_name) && studyDay(dyad.onboardingAt, event.created_at) === day).length +
          dyadEpisodes.filter(episode => episode.day === day).length +
          dyadReflections.filter(reflection => studyDay(dyad.onboardingAt, reflection.created_at) === day).length
      }),
      cpOpenTrend: Array.from({ length: Math.min(STUDY_DAYS, Math.max(1, dyad.currentStudyDay)) }, (_, index) => {
        const day = index + 1
        return dyadEvents.filter(event => event.event_name === 'care_partner_dashboard_viewed' && studyDay(dyad.onboardingAt, event.created_at) === day).length
      }),
      smsSent: dyadSms.filter(message => message.direction === 'outbound').length,
      smsDelivered: dyadSms.filter(message => message.direction === 'outbound' && message.status === 'delivered').length,
      smsFailed: dyadSms.filter(message => message.direction === 'outbound' && message.status === 'failed').length,
      smsPending: dyadSms.filter(message => message.direction === 'outbound' && ['queued', 'sent'].includes(message.status)).length,
      smsDeliveryUnconfirmed: dyadSms.filter(message => message.direction === 'outbound' && message.status === 'twiml_reply').length,
      smsReplied: dyadSms.filter(message => message.direction === 'inbound').length,
      smsParsed: dyadEvents.filter(event => event.event_name.includes('sms') && event.event_name.includes('parsed')).length,
      smsPromptSent: promptMatches.prompts,
      smsPromptAnswered: promptMatches.answered,
      smsMedianLatency: median(promptMatches.latencies),
      features: [...featureCounts.entries()].map(([name, count]) => ({ name, label: eventLabel(name), count })),
      captureParsed,
      captureSaved,
      captureClarified,
      captureFallback,
      captureCorrected,
      mciPlansCreated: dyadCapturedPlans.filter(plan => plan.created_by === dyad.mciProfileId).length,
      cpPlansCreated: dyadCapturedPlans.filter(plan => plan.created_by === dyad.cpProfileId).length,
      mciCompletions: filteredActivities.filter(activity => activity.household_id === dyad.id && activity.logged_by === dyad.mciProfileId).length,
      cpCompletions: filteredActivities.filter(activity => activity.household_id === dyad.id && activity.logged_by === dyad.cpProfileId).length,
      nudgeSent: dyadNudges.length + pushSent,
      nudgeResponsesWithin2h,
      pushSent,
      notificationDays,
      notificationLoadPerActiveDay: notificationDays > 0 ? Math.round(((dyadNudges.length + pushSent) / notificationDays) * 10) / 10 : 0,
      recentEpisodes: dyadEpisodes.slice(0, 4),
      recentMoments: dyadMoments.slice(-4),
    }
  })

  const perDyad = basePerDyad.map(dyad => {
    const dyadEpisodes = allRecoveryEpisodes.filter(episode => episode.householdId === dyad.id)
    const noContext = dyadEpisodes.filter(episode => episode.outcome === 'no_context')
    const rankFailures = dyadEpisodes.filter(episode => episode.outcome === 'rank_failure')
    const unresolved = dyadEpisodes.filter(episode => episode.outcome === 'unresolved_after_result')
    const undelivered = dyad.smsFailed
    const flags: Array<{ question: string; evidence: string; source: string }> = []
    if (noContext.length >= 2) flags.push({
      question: 'What were you looking for that Context did not have?',
      evidence: `${noContext.length} queries returned nothing. Most recent: "${noContext[0]?.query ?? 'Need help remembering?'}"`,
      source: 'Query log',
    })
    if (rankFailures.length >= 2) flags.push({
      question: 'When it showed you a list, did you see what you needed?',
      evidence: `${rankFailures.length} queries where relevant context was returned but not selected.`,
      source: 'Context Rank',
    })
    if (unresolved.length >= 3) flags.push({
      question: 'You looked something up and nothing happened. Walk me through one.',
      evidence: `${unresolved.length} retrievals with a result and no resumption in the window.`,
      source: 'Recovery',
    })
    if (dyad.smsPromptSent > 0 && dyad.smsPromptAnswered / dyad.smsPromptSent < 0.3) flags.push({
      question: 'Tell me about the morning texts.',
      evidence: `${dyad.smsPromptAnswered} answered prompts out of ${dyad.smsPromptSent}.`,
      source: 'SMS',
    })
    if (undelivered > 0) flags.push({
      question: 'Are the texts arriving at all?',
      evidence: `${undelivered} messages sent but not marked delivered.`,
      source: 'SMS · technical',
    })
    if (dyad.reflectionsSaved >= 3 && dyad.reflectionUsed === 0) flags.push({
      question: 'Did any of what you wrote come back to you later?',
      evidence: `${dyad.reflectionsSaved} reflections saved, none selected during a recovery break.`,
      source: 'Modality',
    })
    if (dyad.unresolved >= 6 && dyad.attempts <= 3) flags.push({
      question: 'A lot gets started and left open. What happens?',
      evidence: `${dyad.unresolved} unresolved threads, ${dyad.attempts} recovery attempts.`,
      source: 'Threads',
    })
    if (dyad.daysDark >= 2 && !dyad.withdrawn) flags.push({
      question: 'Check in. Is anything broken?',
      evidence: `No meaningful use for ${dyad.daysDark} days.`,
      source: 'Persistence · technical',
    })
    if (dyad.attempts === 0 && dyad.currentStudyDay >= 4) flags.push({
      question: 'Did you know the Need Help Remembering button was there?',
      evidence: `No recovery attempts by day ${dyad.currentStudyDay}.`,
      source: 'Recovery',
    })
    return { ...dyad, flags, flagCount: flags.length }
  })

  const eventCounts = new Map<string, number>()
  for (const event of filteredEvents.filter(event => isStudyEvent(event.event_name))) eventCounts.set(event.event_name, (eventCounts.get(event.event_name) ?? 0) + 1)
  if (filteredCalendarEvents.length > 0) eventCounts.set('calendar_event_synced', filteredCalendarEvents.length)
  const features = [...eventCounts.entries()].map(([name, count]) => ({ name, label: eventLabel(name), count })).sort((a, b) => b.count - a.count).slice(0, 12)
  const pilotDyads = perDyad.filter(dyad => dyad.cohort === 'pilot-1')
  const internalDyads = perDyad.filter(dyad => dyad.cohort === 'internal')
  const activePilotDyads = pilotDyads.filter(dyad => dyad.active)
  const week2CpValues = perDyad.map(dyad => dyad.week2CpOpensPerDay).filter((value): value is number => typeof value === 'number')
  const week2UseValues = perDyad.map(dyad => dyad.useDaysWeek2).filter((value): value is number => typeof value === 'number')
  const pilotReadiness = {
    internalDyads: internalDyads.length,
    pilotDyads: pilotDyads.length,
    pilotPreviewEnabled: perDyad.filter(dyad => dyad.pilotPreviewEnabled).length,
    calendarSyncEnabled: perDyad.filter(dyad => dyad.calendarSyncEnabled).length,
    calendarConnected: perDyad.filter(dyad => dyad.calendarConnected).length,
    silentDyads: perDyad.filter(dyad => dyad.silentHours > 48).length,
    missingMci: perDyad.filter(dyad => !dyad.mciProfileId).length,
    missingCp: perDyad.filter(dyad => dyad.accountMode === 'shared' && !dyad.cpProfileId).length,
    soloHouseholds: perDyad.filter(dyad => dyad.accountMode === 'solo').length,
    sharedHouseholds: perDyad.filter(dyad => dyad.accountMode === 'shared').length,
    outcomesStarted: outcomeRows.filter(row => row.scores.some(score => score.pre !== null || score.post !== null)).length,
  }
  const exportDyads = perDyad.map(({ id, code, cohort, name, accountMode, mciName, cpName, studyPhase, active, currentStudyDay, daysDark, flagCount, attempts, resumed, nothingHeld, captured, completed, unresolved, smsSent, smsDelivered, smsReplied, pilotPreviewEnabled, calendarConnected, calendarUpcomingCount, nextCalendarAt }) => ({
    id,
    code,
    cohort,
    name,
    accountMode,
    mciName,
    cpName,
    studyPhase,
    active,
    currentStudyDay,
    daysDark,
    flagCount,
    attempts,
    resumed,
    nothingHeld,
    captured,
    completed,
    unresolved,
    smsSent,
    smsDelivered,
    smsReplied,
    pilotPreviewEnabled,
    calendarConnected,
    calendarUpcomingCount,
    nextCalendarAt,
  }))
  const studyArc = perDyad.map(dyad => ({
    householdId: dyad.id,
    householdName: dyad.name,
    studyPhase: dyad.studyPhase,
    days: Array.from({ length: STUDY_DAYS }, (_, index) => {
      const day = index + 1
      const dayEvents = events.filter(event => event.household_id === dyad.id && studyDay(dyad.onboardingAt, event.created_at) === day)
      const daySms = sms.filter(message => message.household_id === dyad.id && studyDay(dyad.onboardingAt, message.created_at) === day)
      const dayPlans = plans.filter(plan => plan.household_id === dyad.id && studyDay(dyad.onboardingAt, plan.created_at) === day)
      const dayCompletions = plans.filter(plan => plan.household_id === dyad.id && plan.confirmed_at && studyDay(dyad.onboardingAt, plan.confirmed_at) === day)
      const dayCalendar = filteredCalendarEvents.filter(event => event.household_id === dyad.id && studyDay(dyad.onboardingAt, event.starts_at) === day)
      return {
        day,
        planLogged: dayPlans.length,
        planCompleted: dayCompletions.length,
        smsReplied: daySms.filter(message => message.direction === 'inbound').length,
        contextViewed: dayEvents.filter(isDashboardEvent).length,
        calendarItem: dayCalendar.length,
      }
    }),
  }))
  const exportStudyArc = studyArc.flatMap(row =>
    row.days.map(day => ({
      householdId: row.householdId,
      householdName: row.householdName,
      studyPhase: row.studyPhase,
      ...day,
    }))
  )

  return {
    filters,
    generatedAt: now.toISOString(),
    freshness: {
      latestEventAt,
      lastCronAt,
      cronWarning: lastCronHours === null || lastCronHours > 26,
    },
    households: includedHouseholds.map(household => ({ id: household.id, name: household.name })),
    cohorts: [
      { id: 'internal', label: 'Internal preview', prefix: 'I', active: internalDyads.length > 0, count: internalDyads.length },
      { id: 'pilot-1', label: 'Participant pilot', prefix: 'P', active: internalDyads.length === 0, count: pilotDyads.length },
    ],
    dyads,
    perDyad,
    silentDyads: perDyad.filter(dyad => dyad.silentHours > 48).sort((a, b) => b.silentHours - a.silentHours),
    recovery: {
      medianAttempts: medianDisplay(activePilotDyads.map(dyad => dyad.attempts)),
      medianResumed: medianDisplay(activePilotDyads.map(dyad => dyad.resumed)),
      medianCaptures: medianDisplay(activePilotDyads.map(dyad => dyad.captured)),
      flaggedDyads: activePilotDyads.filter(dyad => dyad.flagCount > 0).length,
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
      reflectionReturned: reflectionUsed,
      reflectionUsed,
      switches: allRecoveryEpisodes.filter(episode => episode.switched).length,
    },
    partner: {
      week1OpensPerDay: perDyad.length ? perDyad.reduce((sum, dyad) => sum + dyad.week1CpOpensPerDay, 0) / perDyad.length : 0,
      week2OpensPerDay: week2CpValues.length ? week2CpValues.reduce((sum, value) => sum + value, 0) / week2CpValues.length : null,
      daysViewed: perDyad.reduce(
        (sum, dyad) =>
          sum +
          (dyad.week1CpOpensPerDay > 0 ? 1 : 0) +
          (typeof dyad.week2CpOpensPerDay === 'number' && dyad.week2CpOpensPerDay > 0 ? 1 : 0),
        0,
      ),
      reportedLessReminding: 'pending',
    },
    sms: {
      sent: smsSent,
      delivered: smsDelivered,
      failed: smsFailed,
      pending: smsPending,
      deliveryUnconfirmed: smsDeliveryUnconfirmed,
      replied: smsReplied,
      parsed: smsParsed,
      prompts: promptMatches.prompts,
      answeredPrompts: promptMatches.answered,
      promptResponseRate: percent(promptMatches.answered, promptMatches.prompts),
      deliveredNoReply: promptNoResponse.length,
      notUsable: null,
      byPurpose: [...new Set(filteredSms.map(message => message.purpose))].sort().map(purpose => ({
        purpose,
        outbound: filteredSms.filter(message => message.purpose === purpose && message.direction === 'outbound').length,
        inbound: filteredSms.filter(message => message.purpose === purpose && message.direction === 'inbound').length,
        delivered: filteredSms.filter(message => message.purpose === purpose && message.direction === 'outbound' && message.status === 'delivered').length,
      })),
    },
    capture: {
      interpreted: perDyad.reduce((sum, dyad) => sum + dyad.captureParsed, 0),
      saved: perDyad.reduce((sum, dyad) => sum + dyad.captureSaved, 0),
      clarificationNeeded: perDyad.reduce((sum, dyad) => sum + dyad.captureClarified, 0),
      fallbackUsed: perDyad.reduce((sum, dyad) => sum + dyad.captureFallback, 0),
      correctedBeforeSave: perDyad.reduce((sum, dyad) => sum + dyad.captureCorrected, 0),
    },
    independence: {
      mciPlansCreated: perDyad.reduce((sum, dyad) => sum + dyad.mciPlansCreated, 0),
      cpPlansCreated: perDyad.reduce((sum, dyad) => sum + dyad.cpPlansCreated, 0),
      mciCompletions: perDyad.reduce((sum, dyad) => sum + dyad.mciCompletions, 0),
      cpCompletions: perDyad.reduce((sum, dyad) => sum + dyad.cpCompletions, 0),
      selfCaptureRate: percent(
        perDyad.reduce((sum, dyad) => sum + dyad.mciPlansCreated, 0),
        perDyad.reduce((sum, dyad) => sum + dyad.mciPlansCreated + dyad.cpPlansCreated, 0),
      ),
    },
    nudges: {
      sent: perDyad.reduce((sum, dyad) => sum + dyad.nudgeSent, 0),
      responsesWithin2h: perDyad.reduce((sum, dyad) => sum + dyad.nudgeResponsesWithin2h, 0),
      responseRate: percent(
        perDyad.reduce((sum, dyad) => sum + dyad.nudgeResponsesWithin2h, 0),
        perDyad.reduce((sum, dyad) => sum + dyad.nudgeSent, 0),
      ),
      pushSent: perDyad.reduce((sum, dyad) => sum + dyad.pushSent, 0),
      averageLoadPerActiveDay: perDyad.length
        ? Math.round((perDyad.reduce((sum, dyad) => sum + dyad.notificationLoadPerActiveDay, 0) / perDyad.length) * 10) / 10
        : 0,
    },
    dataHealth: {
      status: dataIssues.length === 0 ? 'healthy' : 'attention',
      issues: dataIssues,
      pagination: { pageSize: ANALYTICS_PAGE_SIZE, complete: dataIssues.length === 0 },
      datasets: [
        { name: 'Analytics events', rows: filteredEvents.length, latestAt: latestDate(filteredEvents.map(row => row.created_at)) },
        { name: 'SMS messages', rows: filteredSms.length, latestAt: latestDate(filteredSms.map(row => row.created_at)) },
        { name: 'Plans', rows: filteredPlans.length, latestAt: latestDate(filteredPlans.map(row => row.updated_at ?? row.created_at)) },
        { name: 'Activity logs', rows: filteredActivities.length, latestAt: latestDate(filteredActivities.map(row => row.occurred_at)) },
        { name: 'Timeline', rows: filteredTimeline.length, latestAt: latestDate(filteredTimeline.map(row => row.created_at)) },
        { name: 'Recovery', rows: filteredRecoveryMoments.length, latestAt: latestDate(filteredRecoveryMoments.map(row => row.updated_at)) },
        { name: 'Reflections', rows: filteredReflections.length, latestAt: latestDate(filteredReflections.map(row => row.updated_at)) },
        { name: 'Calendar', rows: filteredCalendarEvents.length, latestAt: latestDate(filteredCalendarEvents.map(row => row.updated_at)) },
        { name: 'Notifications', rows: filteredNotificationEvents.length, latestAt: latestDate(filteredNotificationEvents.map(row => row.sent_at ?? row.created_at)) },
      ],
    },
    persistence: {
      useDaysWeek1: perDyad.reduce((sum, dyad) => sum + dyad.useDaysWeek1, 0),
      useDaysWeek2: week2UseValues.length ? week2UseValues.reduce((sum, value) => sum + value, 0) : null,
      cleanWindowAttempts: allRecoveryEpisodes.filter(episode => episode.day >= 12 && episode.day <= 13).length,
      activeWeek2Dyads: perDyad.filter(dyad => typeof dyad.useDaysWeek2 === 'number' && dyad.useDaysWeek2 > 0).length,
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
    studyArc,
    features,
    pilotReadiness,
    outcomeMeasures: OUTCOME_MEASURES,
    outcomeRows,
    householdRows,
    journeys,
    exports: {
      dyads: exportDyads,
      recovery_episodes: allRecoveryEpisodes,
      queries: allRecoveryEpisodes,
      households: householdRows,
      journeys,
      events: filteredEvents,
      sms: filteredSms,
      plans: filteredPlans,
      outcomes,
      outcome_rows: outcomeRows,
      study_arc: exportStudyArc,
      timeline: filteredTimeline,
      recovery_moments: filteredRecoveryMoments,
      recovery_sessions: recoverySessions.filter(row => householdIds.has(row.household_id)),
      reflections: filteredReflections,
      feature_flags: filteredFeatureFlags,
      calendar_connections: filteredCalendarConnections,
      calendar_events: filteredCalendarEvents,
      notifications: filteredNotificationEvents,
      metric_summary: [{
        sms_outbound: smsSent,
        sms_delivered: smsDelivered,
        sms_replies: smsReplied,
        sms_prompt_response_rate: percent(promptMatches.answered, promptMatches.prompts),
        plans_captured: captured,
        completed_threads: completed,
        recovery_attempts: allRecoveryEpisodes.length,
        recovery_resumed: resolvedEpisodes.length,
        participant_plans_created: perDyad.reduce((sum, dyad) => sum + dyad.mciPlansCreated, 0),
        care_partner_plans_created: perDyad.reduce((sum, dyad) => sum + dyad.cpPlansCreated, 0),
        nudges_sent: perDyad.reduce((sum, dyad) => sum + dyad.nudgeSent, 0),
        nudge_responses_within_2h: perDyad.reduce((sum, dyad) => sum + dyad.nudgeResponsesWithin2h, 0),
        data_health: dataIssues.length === 0 ? 'healthy' : 'attention',
      }],
      pilot_readiness: [pilotReadiness],
    },
  }
}
