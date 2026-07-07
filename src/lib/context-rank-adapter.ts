import type { SupabaseClient } from '@supabase/supabase-js'
import { getLocalDateKey, getUtcRangeForLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { canonicalizeContextRankEvidence } from '@/lib/anthropic'
import {
  config,
  defaultSimilarity,
  makeEvidence,
  type Evidence,
  type EpisodeState,
  type RecoveryIntent,
  type RecoverySession,
} from '@/lib/context-rank'
import type { ActivityLog, PlannedActivity, Profile, Reflection, SmsMessage, TimelineEvent } from '@/types'

type RecoveryMomentRow = {
  id: string
  session_id: string | null
  moment_key: string
  answer_text: string | null
  confidence: string | null
  status: 'shown' | 'confirmed' | 'rejected' | 'skipped'
  shown_at: string
  responded_at: string | null
  created_at?: string | null
}

type RecoverySessionRow = {
  id: string
  user_id: string
  status: 'active' | 'completed' | 'abandoned'
  created_at: string
  completed_at: string | null
}

type ContextRankAdapterInput = {
  supabase: SupabaseClient
  profile: Profile
  queryTime: number
  intent: RecoveryIntent
  sessionId?: string | null
}

function dateWindow(point: number, beforeMs: number, afterMs: number) {
  return {
    earliest: point - beforeMs,
    latest: point + afterMs,
    pointEstimate: point,
  }
}

function dayWindow(dateKey: string, timeZone?: string | null) {
  const range = getUtcRangeForLocalDateKey(dateKey, timeZone)
  return {
    earliest: Date.parse(range.start),
    latest: Date.parse(range.end),
  }
}

function taskPlannedWindow(task: PlannedActivity, timeZone?: string | null) {
  if (task.expected_time) {
    const [hour = 0, minute = 0] = task.expected_time.split(':').map(Number)
    const point = localDateTimeToUtc(task.planned_for, hour, minute, timeZone)
    if (Number.isFinite(point)) return dateWindow(point, 60 * 60 * 1000, 60 * 60 * 1000)
  }
  const ranges: Record<string, [number, number]> = {
    morning: [6, 12],
    afternoon: [12, 17],
    evening: [17, 22],
    anytime: [0, 24],
  }
  const [startHour, endHour] = ranges[task.expected_period] ?? ranges.anytime
  const start = localDateTimeToUtc(task.planned_for, startHour, 0, timeZone)
  const endDate = endHour >= 24 ? addDaysToDateKey(task.planned_for, 1) : task.planned_for
  const end = localDateTimeToUtc(endDate, endHour % 24, 0, timeZone)
  return {
    earliest: start,
    latest: end,
  }
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function localDateTimeToUtc(dateKey: string, hour: number, minute: number, timeZone?: string | null) {
  const naiveUtc = Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    hour,
    minute,
  )
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 5) {
    const candidate = new Date(naiveUtc + offsetMinutes * 60 * 1000)
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]))
    const candidateKey = `${parts.year}-${parts.month}-${parts.day}`
    if (candidateKey === dateKey && Number(parts.hour) === hour && Number(parts.minute) === minute) return candidate.getTime()
  }
  return naiveUtc
}

function displayTask(task: PlannedActivity) {
  return (task.note?.trim() || task.label).trim()
}

function displayActivity(activity: ActivityLog) {
  return (activity.note?.trim() || activity.label).trim()
}

function displayReflection(reflection: Reflection) {
  const nodes = reflection.nodes
  const nodeText = [
    ...(nodes.activities ?? []),
    ...(nodes.people ?? []),
    ...(nodes.places ?? []),
    ...(nodes.feelings ?? []),
  ].filter(Boolean).slice(0, 8).join(', ')
  return nodeText ? `${reflection.ai_summary}. ${nodeText}` : reflection.ai_summary
}

function fallbackCanonicalActivity(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(earlier|confirmed|completed|marked|done|doing|did|this|today|you|were|was|it|looks|like|planned|plan|may|have|been)\b/g, ' ')
    .replace(/\b(went|going)\s+to\b/g, 'go to')
    .replace(/\b(made|making)\b/g, 'make')
    .replace(/\b(took|taking)\b/g, 'take')
    .replace(/\b(worked|working)\s+on\b/g, 'work on')
    .replace(/\b(finished|finishing)\b/g, 'finish')
    .replace(/\b(found|finding)\b/g, 'find')
    .replace(/\b(drove|driving)\b/g, 'drive')
    .replace(/\s+as\s+done\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function canonicalizeEvidence(evidence: Evidence[]) {
  let aiCanonical: Record<string, string> = {}
  try {
    aiCanonical = await Promise.race([
      canonicalizeContextRankEvidence(
        evidence.map(item => ({ id: item.id, text: item.rawContent || item.content, source: item.source })),
      ),
      new Promise<Record<string, string>>(resolve => windowlessTimeout(resolve, 1200, {})),
    ])
  } catch (error) {
    console.error('[ContextRank] AI canonicalization unavailable:', error)
  }
  return evidence.map(item => {
    const fallback = fallbackCanonicalActivity(item.rawContent || item.content)
    const canonical = (aiCanonical[item.id] || fallback || item.content).trim()
    return {
      ...item,
      rawContent: item.rawContent || item.content,
      content: canonical,
    }
  })
}

function windowlessTimeout<T>(resolve: (value: T) => void, ms: number, value: T) {
  setTimeout(() => resolve(value), ms)
}

function sessionStateFromRows(
  rows: RecoveryMomentRow[],
  intent: RecoveryIntent,
  sessionId?: string | null,
  sessionStatus: RecoverySessionRow['status'] = 'active',
) {
  const states: Record<string, EpisodeState> = {}
  const latestByMoment = new Map<string, RecoveryMomentRow>()

  for (const row of rows) {
    const previous = latestByMoment.get(row.moment_key)
    const rowTime = Date.parse(row.responded_at ?? row.shown_at ?? row.created_at ?? '')
    const previousTime = previous ? Date.parse(previous.responded_at ?? previous.shown_at ?? previous.created_at ?? '') : -Infinity
    if (!previous || rowTime >= previousTime) latestByMoment.set(row.moment_key, row)
  }

  for (const row of latestByMoment.values()) {
    const [storedIntent, ...keyParts] = row.moment_key.split(':')
    const hasIntentPrefix = keyParts.length > 0 && storedIntent.includes('_')
    const episodeKey = hasIntentPrefix ? keyParts.join(':') : row.moment_key
    const intentMatches = hasIntentPrefix ? storedIntent === intent : false
    const isCurrentSession = !sessionId || row.session_id === sessionId
    if (row.status === 'shown' && !intentMatches) continue
    if (!isCurrentSession && row.status === 'shown') continue
    if (sessionStatus !== 'active' && row.status === 'shown') continue
    const state = row.status === 'confirmed'
      ? 'confirmed'
      : row.status === 'rejected'
      ? 'rejected'
      : row.status === 'shown'
      ? 'shown'
      : 'exhausted'
    if (hasIntentPrefix && !intentMatches && row.status !== 'rejected') continue
    if (row.status === 'confirmed' && !isCurrentSession) continue
    states[episodeKey] = state
  }
  return states
}

async function getOrCreateSession(
  supabase: SupabaseClient,
  profile: Profile,
  queryTime: number,
  intent: RecoveryIntent,
  sessionId?: string | null,
) {
  if (sessionId) {
    const { data } = await supabase
      .from('recovery_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', profile.user_id)
      .maybeSingle()
    if (data) return data as RecoverySessionRow
  }

  const todayKey = getLocalDateKey(new Date(queryTime), profile.timezone)
  const { data: active } = await supabase
    .from('recovery_sessions')
    .select('*')
    .eq('user_id', profile.user_id)
    .eq('session_date', todayKey)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (active) return active as RecoverySessionRow

  const { data: completed } = await supabase
    .from('recovery_sessions')
    .select('*')
    .eq('user_id', profile.user_id)
    .eq('session_date', todayKey)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (completed) return completed as RecoverySessionRow

  const { data, error } = await supabase
    .from('recovery_sessions')
    .insert({
      user_id: profile.user_id,
      household_id: profile.household_id,
      profile_id: profile.id,
      session_date: todayKey,
      status: 'active',
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as RecoverySessionRow
}

export async function buildContextRankInput({
  supabase,
  profile,
  queryTime,
  intent,
  sessionId,
}: ContextRankAdapterInput): Promise<{ evidence: Evidence[]; session: RecoverySession }> {
  if (!profile.household_id) throw new Error('Profile has no household.')
  const todayRange = getUtcRangeForLocalDay(new Date(queryTime), profile.timezone)
  const todayKey = getLocalDateKey(new Date(queryTime), profile.timezone)
  const lookbackMs = config.intentWindowsMs[intent]
  const windowStart = new Date(Math.min(new Date(todayRange.start).getTime(), queryTime - lookbackMs)).toISOString()
  const windowEnd = new Date(Math.max(new Date(todayRange.end).getTime(), queryTime + 60 * 60 * 1000)).toISOString()

  const [activityResult, taskResult, smsResult, timelineResult, reflectionResult, sessionRow] = await Promise.all([
    supabase
      .from('activity_logs')
      .select('*')
      .eq('household_id', profile.household_id)
      .gte('occurred_at', windowStart)
      .lt('occurred_at', windowEnd)
      .order('occurred_at', { ascending: false })
      .limit(30),
    supabase
      .from('planned_activities')
      .select('*')
      .eq('household_id', profile.household_id)
      .eq('planned_for', todayKey)
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase
      .from('sms_messages')
      .select('*')
      .eq('profile_id', profile.id)
      .gte('created_at', windowStart)
      .lt('created_at', windowEnd)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('timeline_events')
      .select('*')
      .eq('household_id', profile.household_id)
      .gte('created_at', windowStart)
      .lt('created_at', windowEnd)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('reflections')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('reflection_date', todayKey)
      .maybeSingle(),
    getOrCreateSession(supabase, profile, queryTime, intent, sessionId),
  ])

  if (timelineResult.error) {
    console.error('[ContextRank] Timeline evidence unavailable:', timelineResult.error.message)
  }

  const lookupError = activityResult.error || taskResult.error || smsResult.error
  if (lookupError) throw new Error(lookupError.message)
  if (reflectionResult.error && reflectionResult.error.code !== 'PGRST116') throw new Error(reflectionResult.error.message)

  const recoveryResult = await supabase
    .from('recovery_session_moments')
    .select('id,session_id,moment_key,answer_text,confidence,status,shown_at,responded_at,created_at')
    .eq('user_id', profile.user_id)
    .eq('session_date', todayKey)
    .order('responded_at', { ascending: false })
    .limit(40)

  const recoveryRows = recoveryResult.error ? [] : (recoveryResult.data ?? []) as RecoveryMomentRow[]
  const evidence: Evidence[] = []
  const confirmedRecoveryLabels = recoveryRows
    .filter(item => item.status === 'confirmed' && item.answer_text)
    .map(item => fallbackCanonicalActivity(item.answer_text || ''))
    .filter(Boolean)
  const rejectedRecoveryLabels = recoveryRows
    .filter(item => item.status === 'rejected' && item.answer_text)
    .map(item => fallbackCanonicalActivity(item.answer_text || ''))
    .filter(Boolean)
  const completedLabels = new Set<string>()

  for (const activity of (activityResult.data ?? []) as ActivityLog[]) {
    const point = Date.parse(activity.occurred_at)
    const activityText = displayActivity(activity)
    const canonical = fallbackCanonicalActivity(activityText)
    if (canonical) completedLabels.add(canonical)
    evidence.push(makeEvidence({
      id: `activity_log:${activity.id}`,
      userId: profile.user_id,
      content: activityText,
      source: 'activity_log',
      time: dateWindow(point, 30 * 60 * 1000, 30 * 60 * 1000),
      provenance: `activity_logs:${activity.id}`,
    }))
  }

  const timelineEvents = timelineResult.error ? [] : ((timelineResult.data ?? []) as TimelineEvent[])

  for (const event of timelineEvents) {
    const point = Date.parse(event.created_at)
    const source = event.type === 'sms_reply'
      ? 'sms_response'
      : event.type === 'completion'
      ? 'activity_log'
      : 'user_confirmation'
    evidence.push(makeEvidence({
      id: `timeline_event:${event.id}`,
      userId: profile.user_id,
      content: event.text,
      source,
      time: dateWindow(point, 30 * 60 * 1000, 30 * 60 * 1000),
      provenance: `timeline_events:${event.id}`,
      occurrenceStrength: event.confidence === 'high' ? 0.92 : 0.45,
    }))
  }

  for (const task of (taskResult.data ?? []) as PlannedActivity[]) {
    if (task.status === 'confirmed' || task.confirmed_at) {
      const point = Date.parse(task.confirmed_at ?? task.updated_at)
      const taskText = displayTask(task)
      const canonical = fallbackCanonicalActivity(taskText)
      if (canonical) completedLabels.add(canonical)
      evidence.push(makeEvidence({
        id: `task_done:${task.id}`,
        userId: profile.user_id,
        content: taskText,
        source: 'task_done',
        time: dateWindow(point, 2 * 60 * 60 * 1000, 30 * 60 * 1000),
        provenance: `planned_activities:${task.id}`,
      }))
      continue
    }
    if (['planned', 'not_now'].includes(task.status)) {
      const taskText = displayTask(task)
      const plannedCanonical = fallbackCanonicalActivity(taskText)
      const contradictsConfirmed = confirmedRecoveryLabels.some(label => defaultSimilarity(label, plannedCanonical) >= 0.6)
      const contradictsCompleted = Array.from(completedLabels).some(label => defaultSimilarity(label, plannedCanonical) >= 0.6)
      const wasRejected = rejectedRecoveryLabels.some(label => defaultSimilarity(label, plannedCanonical) >= 0.6)
      const source = contradictsConfirmed || contradictsCompleted ? 'task_reopened' : 'task_planned'
      evidence.push(makeEvidence({
        id: `${source}:${task.id}`,
        userId: profile.user_id,
        content: taskText,
        source,
        state: contradictsConfirmed || contradictsCompleted || wasRejected ? 'contradicting' : 'supporting',
        occurrenceStrength: wasRejected ? 0.25 : contradictsConfirmed || contradictsCompleted ? 0.80 : undefined,
        time: taskPlannedWindow(task, profile.timezone),
        provenance: `planned_activities:${task.id}`,
      }))
    }
  }

  for (const message of (smsResult.data ?? []) as SmsMessage[]) {
    const point = Date.parse(message.created_at)
    if (message.direction === 'inbound') {
      evidence.push(makeEvidence({
        id: `sms_response:${message.id}`,
        userId: profile.user_id,
        content: message.body,
        source: 'sms_response',
        time: dateWindow(point, 30 * 60 * 1000, 30 * 60 * 1000),
        provenance: `sms_messages:${message.id}`,
      }))
    } else {
      evidence.push(makeEvidence({
        id: `sms_ignored:${message.id}`,
        userId: profile.user_id,
        content: message.body,
        source: 'sms_ignored',
        time: dateWindow(point, 30 * 60 * 1000, 30 * 60 * 1000),
        provenance: `sms_messages:${message.id}`,
      }))
    }
  }

  const reflection = reflectionResult.data as Reflection | null
  if (reflection?.ai_summary) {
    evidence.push(makeEvidence({
      id: `reflection:${reflection.id}`,
      userId: profile.user_id,
      content: displayReflection(reflection),
      source: 'reflection',
      time: dayWindow(reflection.reflection_date, profile.timezone),
      provenance: `reflections:${reflection.id}`,
    }))
  }

  for (const row of recoveryRows.filter(item => item.status === 'confirmed' && item.answer_text)) {
    const point = Date.parse(row.responded_at ?? row.shown_at)
    evidence.push(makeEvidence({
      id: `user_confirmation:${row.id}`,
      userId: profile.user_id,
      content: row.answer_text!,
      source: 'user_confirmation',
      state: 'confirmed',
      time: dateWindow(point, 2 * 60 * 60 * 1000, 30 * 60 * 1000),
      provenance: `recovery_session_moments:${row.id}`,
    }))
  }

  const canonicalEvidence = await canonicalizeEvidence(evidence)

  return {
    evidence: canonicalEvidence,
    session: {
      id: sessionRow.id,
      userId: profile.user_id,
      state: 'intent_selected',
      intent,
      candidateStates: sessionStateFromRows(recoveryRows, intent, sessionRow.id, sessionRow.status),
      history: [],
    },
  }
}
