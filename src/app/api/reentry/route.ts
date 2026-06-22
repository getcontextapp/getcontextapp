import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { generateRecallAnswer } from '@/lib/anthropic'
import { trackEvent } from '@/lib/analytics'
import type { PlannedActivity, TimelineEvent } from '@/types'

function formatTime(value: string, timeZone?: string | null) {
  return new Date(value).toLocaleTimeString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatPlanClock(value: string) {
  const [hourText, minuteText] = value.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`
}

function getCurrentPlan(plans: PlannedActivity[], timeZone?: string | null) {
  const now = new Date()
  const localHour = Number(now.toLocaleString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    hour12: false,
  }))
  const period =
    localHour < 12 ? 'morning' :
    localHour < 17 ? 'afternoon' :
    'evening'

  return plans.find(item => item.status === 'planned' && item.expected_time) ??
    plans.find(item => item.status === 'planned' && item.expected_period === period) ??
    plans.find(item => item.status === 'planned' || item.status === 'not_now') ??
    null
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

  const [timelineResult, smsResult, activityResult, planResult] = await Promise.all([
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
      .select('*')
      .eq('profile_id', profile.id)
      .eq('direction', 'inbound')
      .gte('created_at', todayRange.start)
      .lt('created_at', todayRange.end)
      .order('created_at', { ascending: false })
      .limit(5),
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
  ])

  const timelineUnavailable = timelineResult.error?.code === '42P01'
  if (timelineResult.error && !timelineUnavailable) {
    console.error('[Reentry] Timeline lookup failed:', timelineResult.error.message)
  }
  const lookupError = smsResult.error || activityResult.error || planResult.error
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  const timeline = (timelineUnavailable ? [] : timelineResult.data ?? []) as TimelineEvent[]
  const explicitEvent = timeline.find(event => event.confidence === 'high' && (event.type === 'doing_now' || event.type === 'did' || event.type === 'sms_reply'))
  const inboundSms = (smsResult.data ?? [])[0]
  const latestActivity = (activityResult.data ?? [])[0]
  const currentPlan = getCurrentPlan((planResult.data ?? []) as PlannedActivity[], profile.timezone)

  let confidence: 'certain' | 'guess' | 'unknown' = 'unknown'
  let evidenceText: string | null = null
  let sourceText = 'Tell me, and I will remember it.'

  if (explicitEvent) {
    confidence = 'certain'
    evidenceText = explicitEvent.text
    sourceText = `You told me at ${formatTime(explicitEvent.created_at, profile.timezone)}.`
  } else if (inboundSms?.body) {
    confidence = 'certain'
    evidenceText = String(inboundSms.body).trim().slice(0, 160)
    sourceText = `You texted Context at ${formatTime(inboundSms.created_at, profile.timezone)}.`
  } else if (currentPlan) {
    confidence = 'guess'
    evidenceText = currentPlan.note?.trim() || currentPlan.label
    sourceText = currentPlan.expected_time
      ? `This is from your ${formatPlanClock(currentPlan.expected_time)} plan.`
      : "This is from today's plan."
  } else if (latestActivity) {
    confidence = 'guess'
    evidenceText = latestActivity.note?.trim() || latestActivity.label
    sourceText = 'This is from when something was marked done.'
  }

  const answer = await generateRecallAnswer({
    displayName: profile.display_name,
    timeZone: profile.timezone,
    confidence,
    evidenceText,
    sourceText,
  })

  await trackEvent(supabase, {
    eventName: 'reentry_recall_requested',
    profile,
    userId: user.id,
    properties: { confidence },
  })

  return NextResponse.json(answer)
}
