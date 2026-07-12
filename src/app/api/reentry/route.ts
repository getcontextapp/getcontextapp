import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { generateRecallAnswersBatch } from '@/lib/anthropic'
import type { RecallAnswerInput, RecallAnswer } from '@/lib/anthropic'
import { trackEvent } from '@/lib/analytics'
import { ensureRepeatOccurrencesForDate } from '@/lib/task-scheduling-server'
import type { PlannedActivity, TimelineEvent } from '@/types'

type RecallInput = RecallAnswerInput

type MomentEvidence = {
  key: string
  label: string
  confidence: 'certain' | 'guess'
  evidenceText: string
  sourceText: string
  occurredAt: string
  priority: number
  sourceId: string
  linkedActivityId?: string | null
}

type CanonicalMoment = {
  key: string
  label: string
  evidence: MomentEvidence[]
}

type RecoveryMomentStatus = 'shown' | 'confirmed' | 'rejected' | 'skipped'

type RecoveryMoment = {
  id: string
  moment_key: string
  answer_text: string | null
  confidence: string | null
  status: RecoveryMomentStatus
  shown_at: string
  responded_at: string | null
}

type RecoverySession = {
  id: string
  status: 'active' | 'completed' | 'abandoned'
  completed_at: string | null
  last_confirmed_text: string | null
  last_confirmed_at: string | null
}

function formatTime(value: string, timeZone?: string | null) {
  return new Date(value).toLocaleTimeString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function recallPhrase(text: string, fallbackPrefix = '') {
  const value = text.trim().replace(/[?.!]+$/, '')
  const lower = value.toLowerCase()
  if (!value) return 'doing something from your day'
  if (/^(at|with|having|getting|making|taking|walking|driving|calling|resting|reading|watching|eating)\b/i.test(value)) {
    return value
  }
  if (lower === 'drive' || lower.startsWith('drive ')) return value.replace(/^drive\b/i, 'driving')
  if (lower.startsWith('go to ')) return value.replace(/^go\b/i, 'going')
  if (lower.startsWith('call ')) return value.replace(/^call\b/i, 'calling')
  if (lower.startsWith('take ')) return value.replace(/^take\b/i, 'taking')
  if (lower.startsWith('walk ')) return value.replace(/^walk\b/i, 'walking')
  if (lower.startsWith('eat ')) return value.replace(/^eat\b/i, 'eating')
  if (lower.startsWith('make ')) return value.replace(/^make\b/i, 'making')
  return `${fallbackPrefix}${value}`
}

function displayLabel(text: string) {
  return text
    .trim()
    .replace(/[?.!]+$/, '')
    .replace(/\s+/g, ' ')
}

function canonicalTokens(text: string) {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'appointment',
    'at',
    'for',
    'my',
    'the',
    'this',
    'to',
    'today',
    'your',
  ])
  const normalized = text
    .toLowerCase()
    .replace(/\b(this\s+)?(morning|afternoon|evening|tonight|today)\b/g, ' ')
    .replace(/\b(you|i)\s+(were|was|have|had|did|do|done|completed|confirmed|planned)\b/g, ' ')
    .replace(/\b(take|took|taking)\b/g, 'take')
    .replace(/\b(go|going|went)\b/g, 'go')
    .replace(/\b(drive|driving|drove)\b/g, 'drive')
    .replace(/\b(call|calling|called)\b/g, 'call')
    .replace(/\b(make|making|made)\b/g, 'make')
    .replace(/\b(complete|completed|completing)\b/g, 'complete')
    .replace(/\b(mark|marked|marking)\b/g, 'mark')
    .replace(/[^a-z0-9\s]/g, ' ')

  return Array.from(new Set(
    normalized
      .split(/\s+/)
      .map(token => token.trim())
      .filter(token => token.length > 1 && !stopWords.has(token)),
  )).sort()
}

function canonicalKey(text: string) {
  const tokens = canonicalTokens(text)
  return tokens.length > 0 ? tokens.join('|') : displayLabel(text).toLowerCase()
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(canonicalTokens(left))
  const rightTokens = new Set(canonicalTokens(right))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  const overlap = Array.from(leftTokens).filter(token => rightTokens.has(token)).length
  return overlap / Math.min(leftTokens.size, rightTokens.size)
}

function reflectionEvidence(nodes: any, summary?: string | null) {
  const safeNodes = nodes && typeof nodes === 'object' ? nodes as Record<string, unknown> : {}
  const values = ['activities', 'people', 'places', 'feelings']
    .flatMap(key => Array.isArray(safeNodes[key]) ? safeNodes[key] as unknown[] : [])
    .map(item => String(item ?? '').trim())
    .filter(Boolean)

  const summaryText = String(summary ?? '').trim()
  if (summaryText && values.length > 0) {
    return `${summaryText} Memory nodes: ${values.slice(0, 8).join(', ')}`.slice(0, 320)
  }
  if (summaryText) return summaryText.slice(0, 240)
  if (values.length > 0) return values.slice(0, 6).join(', ')
  return ''
}

function periodForTimestamp(value: string, timeZone?: string | null) {
  const hour = Number(new Date(value).toLocaleString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    hour12: false,
  }))
  if (!Number.isFinite(hour)) return 'today'
  if (hour < 12) return 'this morning'
  if (hour < 17) return 'this afternoon'
  if (hour < 21) return 'this evening'
  return 'tonight'
}

function sourcePeriod(value: string, timeZone?: string | null) {
  const period = periodForTimestamp(value, timeZone)
  return period === 'today' ? 'today' : period
}

function isPlanListSms(body: string, outboundPrompts: Array<{ created_at: string; purpose: string }>, createdAt: string) {
  const text = body.trim()
  const lower = text.toLowerCase()
  if (lower.includes('things to do today') || lower.includes('things i want to do')) return true
  if (/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+\S/.test(text)) return true
  const listItems = text
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
  if (listItems.length >= 3) return true
  return outboundPrompts.some(prompt =>
    (prompt.purpose === 'morning' || prompt.purpose === 'morning_prompt') &&
    new Date(createdAt).getTime() >= new Date(prompt.created_at).getTime() &&
    new Date(createdAt).getTime() - new Date(prompt.created_at).getTime() <= 30 * 60 * 1000
  )
}

function unknownMoment(displayName: string, timeZone?: string | null): RecallInput {
  return {
    displayName,
    timeZone,
    confidence: 'unknown',
    evidenceText: null,
    sourceText: 'Tell me, and I will remember it.',
  }
}

function isMissingRecoveryMomentTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.toLowerCase().includes('recovery_session_moments')
    ),
  )
}

function addCanonicalMoment(groups: CanonicalMoment[], evidence: MomentEvidence) {
  const linkedGroup = evidence.linkedActivityId
    ? groups.find(group => group.evidence.some(item => item.sourceId === `activity:${evidence.linkedActivityId}`))
    : null
  const similarGroup = linkedGroup ?? groups.find(group =>
    group.key === evidence.key ||
    tokenSimilarity(group.label, evidence.label) >= 0.8,
  )

  if (similarGroup) {
    if (!similarGroup.evidence.some(item => item.sourceId === evidence.sourceId)) {
      similarGroup.evidence.push(evidence)
      similarGroup.evidence.sort(compareEvidence)
    }
    if (evidence.priority < similarGroup.evidence[0].priority) similarGroup.label = evidence.label
    return
  }

  groups.push({
    key: evidence.key,
    label: evidence.label,
    evidence: [evidence],
  })
}

function compareEvidence(left: MomentEvidence, right: MomentEvidence) {
  if (left.priority !== right.priority) return left.priority - right.priority
  return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
}

function canonicalMomentToRecallInput(moment: CanonicalMoment, displayName: string, timeZone?: string | null): RecallInput {
  const evidence = [...moment.evidence].sort(compareEvidence)
  const best = evidence[0]
  const hasCertain = evidence.some(item => item.confidence === 'certain')

  return {
    displayName,
    timeZone,
    confidence: hasCertain ? 'certain' : 'guess',
    evidenceText: best.evidenceText,
    sourceText: best.sourceText,
  }
}

function currentLocalMinutes(timeZone?: string | null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function plannedTimeDistance(plan: PlannedActivity, timeZone?: string | null) {
  if (!plan.expected_time) return Number.POSITIVE_INFINITY
  const nowMinutes = currentLocalMinutes(timeZone)
  if (nowMinutes === null) return Number.POSITIVE_INFINITY
  const [hourText, minuteText] = plan.expected_time.split(':')
  const planMinutes = Number(hourText) * 60 + Number(minuteText)
  if (!Number.isFinite(planMinutes)) return Number.POSITIVE_INFINITY
  return Math.abs(nowMinutes - planMinutes)
}

function recoveryMemoryAnswer(moment: RecoveryMoment, timeZone?: string | null): RecallAnswer {
  return {
    confidence: 'certain',
    confidenceLabel: 'Certain',
    answer: `Earlier, you confirmed: ${moment.answer_text || 'something from your day'}`,
    source: `Confirmed at ${formatTime(moment.responded_at || moment.shown_at, timeZone)}.`,
    asksConfirmation: false,
  }
}

function recoverySessionMemoryAnswer(session: RecoverySession, timeZone?: string | null): RecallAnswer | null {
  if (!session.last_confirmed_text) return null
  return {
    confidence: 'certain',
    confidenceLabel: 'Certain',
    answer: `Earlier, you confirmed: ${session.last_confirmed_text}`,
    source: `Confirmed at ${formatTime(session.last_confirmed_at || session.completed_at || new Date().toISOString(), timeZone)}.`,
    asksConfirmation: false,
  }
}

async function getOrCreateRecoverySession(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  profile: any,
  userId: string,
  todayKey: string,
) {
  const { data: existing, error: lookupError } = await supabase
    .from('recovery_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_date', todayKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (isMissingRecoveryMomentTable(lookupError)) return { session: null, error: null }
  if (lookupError) return { session: null, error: lookupError }
  if (existing) return { session: existing as RecoverySession, error: null }

  const { data: created, error: createError } = await supabase
    .from('recovery_sessions')
    .insert({
      user_id: userId,
      household_id: profile.household_id,
      profile_id: profile.id,
      session_date: todayKey,
      status: 'active',
    })
    .select('*')
    .single()

  return { session: created as RecoverySession | null, error: createError }
}

async function getRecoveryMoments(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  todayKey: string,
) {
  const { data, error } = await supabase
    .from('recovery_session_moments')
    .select('id,moment_key,answer_text,confidence,status,shown_at,responded_at')
    .eq('user_id', userId)
    .eq('session_date', todayKey)
    .order('shown_at', { ascending: false })

  if (isMissingRecoveryMomentTable(error)) return { moments: [] as RecoveryMoment[], tableAvailable: false, error: null }
  if (error) return { moments: [] as RecoveryMoment[], tableAvailable: false, error }
  return { moments: (data ?? []) as RecoveryMoment[], tableAvailable: true, error: null }
}

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id || profile.role !== 'mci_user') {
    return NextResponse.json({ error: 'MCI profile required' }, { status: 403 })
  }

  const todayRange = getUtcRangeForLocalDay(new Date(), profile.timezone)
  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const { session: recoverySession, error: sessionError } = await getOrCreateRecoverySession(supabase, profile, user.id, todayKey)
  if (sessionError) {
    console.error('[Reentry] Recovery session lookup failed:', sessionError.message)
  }
  const recoveryResult = await getRecoveryMoments(supabase, user.id, todayKey)
  if (recoveryResult.error) {
    console.error('[Reentry] Recovery moment lookup failed:', recoveryResult.error.message)
  }
  const recoveryMoments = recoveryResult.moments
  const tableAvailable = recoveryResult.tableAvailable
  const confirmedMoments = recoveryMoments.filter(moment => moment.status === 'confirmed')
  const rejectedMomentKeys = new Set(recoveryMoments.filter(moment => moment.status === 'rejected').map(moment => moment.moment_key))
  const shownMomentKeys = new Set(recoveryMoments.filter(moment => moment.status === 'shown').map(moment => moment.moment_key))
  // Once a session is exhausted, a moment that was only shown (never answered)
  // should not loop back on a cold reopen. While the session is still active we
  // keep it eligible (down-ranked) so "See another moment" can return to it.
  const sessionExhausted = recoverySession?.status === 'completed'

  // Fallback only when the per-moment table is unavailable: we cannot know which
  // specific moments were confirmed, so surface the single session-level memory.
  // When the table IS available we always run the full pipeline so newly completed
  // activities still rank and confirmed moments come back as pageable statements.
  if (!tableAvailable && recoverySession?.last_confirmed_text) {
    const answer = recoverySessionMemoryAnswer(recoverySession, profile.timezone)
    if (answer) {
      await trackEvent(supabase, {
        eventName: 'reentry_recall_requested',
        profile,
        userId: user.id,
        properties: {
          confidence: answer.confidence,
          moment_count: 1,
          recovery_memory: true,
          recovery_session_fallback: true,
        },
      })
      return NextResponse.json({ ...answer, moments: [answer] })
    }
  }

  await ensureRepeatOccurrencesForDate(supabase, profile.household_id, todayKey)

  const [timelineResult, smsResult, activityResult, planResult, reflectionResult] = await Promise.all([
    supabase
      .from('timeline_events')
      .select('*')
      .eq('household_id', profile.household_id)
      .gte('created_at', todayRange.start)
      .lt('created_at', todayRange.end)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('sms_messages')
      .select('id, direction, purpose, body, created_at')
      .eq('profile_id', profile.id)
      .gte('created_at', todayRange.start)
      .lt('created_at', todayRange.end)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('activity_logs')
      .select('*')
      .eq('household_id', profile.household_id)
      .gte('occurred_at', todayRange.start)
      .lt('occurred_at', todayRange.end)
      .order('occurred_at', { ascending: false })
      .limit(5),
    supabase
      .from('planned_activities')
      .select('*')
      .eq('household_id', profile.household_id)
      .eq('planned_for', todayKey)
      .order('created_at', { ascending: true }),
    supabase
      .from('reflections')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('reflection_date', todayKey)
      .maybeSingle(),
  ])

  const timelineUnavailable = timelineResult.error?.code === '42P01'
  if (timelineResult.error && !timelineUnavailable) {
    console.error('[Reentry] Timeline lookup failed:', timelineResult.error.message)
  }
  const reflectionUnavailable = reflectionResult.error?.code === '42P01'
  if (reflectionResult.error && !reflectionUnavailable) {
    console.error('[Reentry] Reflection lookup failed:', reflectionResult.error.message)
  }
  const lookupError = smsResult.error || activityResult.error || planResult.error
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  const timeline = (timelineUnavailable ? [] : timelineResult.data ?? []) as TimelineEvent[]
  const explicitEvents = timeline.filter(event =>
    event.confidence === 'high' &&
    (event.type === 'doing_now' || event.type === 'did'),
  )
  const outboundPrompts = (smsResult.data ?? [])
    .filter(message => message.direction === 'outbound')
    .map(message => ({
      created_at: String(message.created_at),
      purpose: String(message.purpose),
    }))
  const planListSmsIds = new Set(
    (smsResult.data ?? [])
      .filter(message => message.direction === 'inbound' && message.body && isPlanListSms(String(message.body), outboundPrompts, String(message.created_at)))
      .map(message => String(message.id)),
  )
  const activities = activityResult.data ?? []
  const plans = (planResult.data ?? []) as PlannedActivity[]
  const reflection = reflectionUnavailable ? null : reflectionResult.data

  const canonicalMoments: CanonicalMoment[] = []

  for (const event of explicitEvents.slice(0, 2)) {
    const label = displayLabel(event.text)
    addCanonicalMoment(canonicalMoments, {
      key: canonicalKey(label),
      label,
      confidence: 'certain',
      evidenceText: event.text,
      sourceText: `You told me at ${formatTime(event.created_at, profile.timezone)}.`,
      occurredAt: event.created_at,
      priority: 1,
      sourceId: `timeline:${event.id}`,
    })
  }

  for (const activity of activities.slice(0, 3)) {
    const label = displayLabel(activity.note?.trim() || activity.label)
    addCanonicalMoment(canonicalMoments, {
      key: canonicalKey(label),
      label,
      confidence: 'certain',
      evidenceText: recallPhrase(activity.note?.trim() || activity.label),
      sourceText: `Marked done ${sourcePeriod(activity.occurred_at, profile.timezone)}.`,
      occurredAt: activity.occurred_at,
      priority: 2,
      sourceId: `activity:${activity.id}`,
    })
  }

  for (const plan of plans.filter(item => item.status === 'confirmed' && item.confirmed_at).slice(0, 3)) {
    const label = displayLabel(plan.note?.trim() || plan.label)
    addCanonicalMoment(canonicalMoments, {
      key: canonicalKey(label),
      label,
      confidence: 'certain',
      evidenceText: recallPhrase(plan.note?.trim() || plan.label),
      sourceText: `Confirmed at ${formatTime(plan.confirmed_at!, profile.timezone)}.`,
      occurredAt: plan.confirmed_at!,
      priority: 3,
      sourceId: `plan:${plan.id}`,
      linkedActivityId: plan.confirmed_activity_log_id,
    })
  }

  if (reflection?.ai_summary) {
    const evidence = reflectionEvidence(reflection.nodes, reflection.ai_summary)
    const label = displayLabel(evidence || reflection.ai_summary)
    addCanonicalMoment(canonicalMoments, {
      key: canonicalKey(label),
      label,
      confidence: 'certain',
      evidenceText: evidence || reflection.ai_summary,
      sourceText: 'According to your Reflection today.',
      occurredAt: reflection.created_at,
      priority: 4,
      sourceId: `reflection:${reflection.id}`,
    })
  }

  const certainMomentEntries = canonicalMoments
    .map(moment => ({
      ...moment,
      evidence: [...moment.evidence].sort(compareEvidence),
    }))
    .filter(moment => !confirmedMoments.some(confirmed => confirmed.moment_key === moment.key))
    .filter(moment => !rejectedMomentKeys.has(moment.key))
    .filter(moment => !(sessionExhausted && shownMomentKeys.has(moment.key)))
    .sort((left, right) => {
      const leftShown = shownMomentKeys.has(left.key) ? 1 : 0
      const rightShown = shownMomentKeys.has(right.key) ? 1 : 0
      if (leftShown !== rightShown) return leftShown - rightShown
      return compareEvidence(left.evidence[0], right.evidence[0])
    })
    .map(moment => ({
      key: moment.key,
      input: canonicalMomentToRecallInput(moment, profile.display_name, profile.timezone),
    }))

  const plannedMomentEntries: Array<{ key: string; input: RecallInput }> = []
  if (certainMomentEntries.length === 0) {
    const plannedGroups: CanonicalMoment[] = []
    for (const plan of plans.filter(item => item.status === 'planned').slice(0, 6)) {
      const label = displayLabel(plan.note?.trim() || plan.label)
      const key = canonicalKey(label)
      if (rejectedMomentKeys.has(key)) continue
      if (confirmedMoments.some(confirmed => confirmed.moment_key === key)) continue
      if (sessionExhausted && shownMomentKeys.has(key)) continue
      addCanonicalMoment(plannedGroups, {
        key,
        label,
        confidence: 'guess',
        evidenceText: recallPhrase(plan.note?.trim() || plan.label, 'getting ready for '),
        sourceText: 'This was only planned, not confirmed.',
        occurredAt: plan.expected_time ? `${todayKey}T${plan.expected_time}` : plan.created_at,
        priority: plannedTimeDistance(plan, profile.timezone) <= 120 ? 5 : 6,
        sourceId: `plan:${plan.id}`,
      })
    }
    plannedMomentEntries.push(...plannedGroups
      .map(moment => ({
        ...moment,
        evidence: [...moment.evidence].sort(compareEvidence),
      }))
      .sort((left, right) => {
        const leftShown = shownMomentKeys.has(left.key) ? 1 : 0
        const rightShown = shownMomentKeys.has(right.key) ? 1 : 0
        if (leftShown !== rightShown) return leftShown - rightShown
        return compareEvidence(left.evidence[0], right.evidence[0])
      })
      .map(moment => ({
        key: moment.key,
        input: canonicalMomentToRecallInput(moment, profile.display_name, profile.timezone),
      })))
  }

  // Fresh moments still worth reviewing (Yes/No), capped to keep the flow short.
  const freshMomentEntries = [...certainMomentEntries, ...plannedMomentEntries].slice(0, 4)
  const freshAnswers = await generateRecallAnswersBatch(freshMomentEntries)

  // Already-confirmed moments come back as calm statements, placed AFTER anything
  // still worth reviewing, so the user can page to them with "See another moment".
  const confirmedAnswers = confirmedMoments.map(moment => ({
    ...recoveryMemoryAnswer(moment, profile.timezone),
    momentKey: moment.moment_key,
  }))

  let moments = [...freshAnswers, ...confirmedAnswers]

  if (moments.length === 0) {
    if (sessionExhausted || shownMomentKeys.size > 0 || rejectedMomentKeys.size > 0) {
      // The user has already worked through what we know: give a calm, definite end.
      const sessionComplete: RecallAnswer & { momentKey: string } = {
        confidence: 'unknown',
        confidenceLabel: 'Not sure',
        answer: "That's everything I know right now.",
        source: 'You reviewed the notes I had.',
        asksConfirmation: false,
        momentKey: 'session-complete',
      }
      moments = [sessionComplete]
    } else {
      // Genuinely empty day: nothing done, nothing planned, nothing reviewed yet.
      moments = await generateRecallAnswersBatch([
        { key: 'unknown', input: unknownMoment(profile.display_name, profile.timezone) },
      ])
    }
  }

  const answer = moments[0]

  await trackEvent(supabase, {
    eventName: 'reentry_recall_requested',
    profile,
    userId: user.id,
    properties: { confidence: answer.confidence, moment_count: moments.length, filtered_plan_sms_count: planListSmsIds.size },
  })

  return NextResponse.json({ ...answer, moments })
}
