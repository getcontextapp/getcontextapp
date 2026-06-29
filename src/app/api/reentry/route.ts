import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { generateRecallAnswer } from '@/lib/anthropic'
import { trackEvent } from '@/lib/analytics'
import type { PlannedActivity, TimelineEvent } from '@/types'

type RecallInput = Parameters<typeof generateRecallAnswer>[0]

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
  const supportingSources = evidence
    .slice(1, 4)
    .map(item => item.sourceText)
    .filter(source => source !== best.sourceText)
  const sourceText = supportingSources.length > 0
    ? `${best.sourceText} Also seen in ${supportingSources.length} related note${supportingSources.length === 1 ? '' : 's'}.`
    : best.sourceText

  return {
    displayName,
    timeZone,
    confidence: hasCertain ? 'certain' : 'guess',
    evidenceText: best.evidenceText,
    sourceText,
  }
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
      sourceText: `You completed this ${sourcePeriod(activity.occurred_at, profile.timezone)}.`,
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
      sourceText: `You confirmed this at ${formatTime(plan.confirmed_at!, profile.timezone)}.`,
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

  for (const plan of plans.filter(item => item.status === 'planned').slice(0, 3)) {
    const label = displayLabel(plan.note?.trim() || plan.label)
    addCanonicalMoment(canonicalMoments, {
      key: canonicalKey(label),
      label,
      confidence: 'guess',
      evidenceText: recallPhrase(plan.note?.trim() || plan.label, 'getting ready for '),
      sourceText: 'You planned this earlier today. This was only planned, not confirmed.',
      occurredAt: plan.created_at,
      priority: 5,
      sourceId: `plan:${plan.id}`,
    })
  }

  const uniqueMoments = canonicalMoments
    .map(moment => ({
      ...moment,
      evidence: [...moment.evidence].sort(compareEvidence),
    }))
    .sort((left, right) => compareEvidence(left.evidence[0], right.evidence[0]))
    .map(moment => canonicalMomentToRecallInput(moment, profile.display_name, profile.timezone))
    .slice(0, 4)

  if (uniqueMoments.length === 0) {
    uniqueMoments.push(unknownMoment(profile.display_name, profile.timezone))
  }

  const answers = await Promise.all(uniqueMoments.map(moment => generateRecallAnswer(moment)))
  const answer = answers[0]

  await trackEvent(supabase, {
    eventName: 'reentry_recall_requested',
    profile,
    userId: user.id,
    properties: { confidence: answer.confidence, moment_count: answers.length, filtered_plan_sms_count: planListSmsIds.size },
  })

  return NextResponse.json({ ...answer, moments: answers })
}
