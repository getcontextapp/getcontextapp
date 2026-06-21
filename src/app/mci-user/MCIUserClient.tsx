'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { trackClientEvent } from '@/lib/client-analytics'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { suppressNearbyDuplicateActivities } from '@/lib/activity-display'
import { ACTIVITY_TILES } from '@/types'
import type { Profile, ActivityLog, PlannedActivity, TimelineEvent } from '@/types'
import HouseholdCode from '@/components/mci/HouseholdCode'
import ReminderSettings from '@/components/mci/ReminderSettings'
import NaturalLanguagePlanComposer from '@/components/mci/NaturalLanguagePlanComposer'
import EditTaskSheet from '@/components/mci/EditTaskSheet'
import { addDaysToKey, formatTaskTiming, REPEAT_LABELS } from '@/lib/task-scheduling'

interface Props {
  profile: Profile
  initialActivities: ActivityLog[]
  initialPlannedActivities: PlannedActivity[]
  initialTimelineEvents: TimelineEvent[]
  carePartner: Profile | null
  household: { join_code: string; name: string } | null
}

const PERIOD_ORDER: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  anytime: 3,
}

type RecallAnswer = {
  confidence: 'certain' | 'guess' | 'unknown'
  confidenceLabel: 'Certain' | 'Best guess' | 'Not sure'
  answer: string
  source: string
  asksConfirmation: boolean
}

export default function MCIUserClient({ profile, initialActivities, initialPlannedActivities, initialTimelineEvents, carePartner, household }: Props) {
  const [supabase] = useState(createClient)

  const [activities, setActivities] = useState<ActivityLog[]>(initialActivities)
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>(initialPlannedActivities)
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>(initialTimelineEvents)
  const [showSettings, setShowSettings] = useState(false)
  const [showHousehold, setShowHousehold] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<PlannedActivity | null>(null)
  const [editCandidate, setEditCandidate] = useState<PlannedActivity | null>(null)
  const [moveCandidate, setMoveCandidate] = useState<PlannedActivity | null>(null)
  const [moveDate, setMoveDate] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)
  const [openMoreId, setOpenMoreId] = useState<string | null>(null)
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null)
  const [confirmingPlanIds, setConfirmingPlanIds] = useState<string[]>([])
  const [clockNow, setClockNow] = useState(() => new Date())
  const [recallOpen, setRecallOpen] = useState(false)
  const [recallLoading, setRecallLoading] = useState(false)
  const [recallAnswer, setRecallAnswer] = useState<RecallAnswer | null>(null)
  const [recallResolved, setRecallResolved] = useState<'yes' | 'no' | null>(null)
  const [recallCorrection, setRecallCorrection] = useState('')
  const [recallSaving, setRecallSaving] = useState(false)

  const localHour = Number(clockNow.toLocaleString('en-US', {
    timeZone: profile.timezone,
    hour: 'numeric',
    hour12: false,
  }))
  const greeting = localHour < 12 ? 'Good morning' : localHour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = clockNow.toLocaleDateString('en-US', {
    timeZone: profile.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const orientationTime = clockNow.toLocaleTimeString('en-US', {
    timeZone: profile.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const weekday = clockNow.toLocaleDateString('en-US', {
    timeZone: profile.timezone,
    weekday: 'long',
  })
  const partOfDay =
    localHour < 12 ? 'morning' :
    localHour < 17 ? 'afternoon' :
    localHour < 21 ? 'evening' :
    'night'
  const todayKey = getLocalDateKey(clockNow, profile.timezone)
  const tomorrowKey = addDaysToKey(todayKey, 1)

  const scheduleContextCardRefresh = useCallback(() => {}, [])

  const refreshDashboardData = useCallback(async () => {
    const todayRange = getUtcRangeForLocalDay(new Date(), profile.timezone)
    const [activityResult, plannedResult, timelineResult] = await Promise.all([
      supabase
        .from('activity_logs')
        .select('*')
        .eq('household_id', profile.household_id)
        .gte('occurred_at', todayRange.start)
        .lt('occurred_at', todayRange.end)
        .order('occurred_at', { ascending: false })
        .limit(20),
      supabase
        .from('planned_activities')
        .select('*')
        .eq('household_id', profile.household_id)
        .eq('planned_for', getLocalDateKey(new Date(), profile.timezone))
        .order('created_at', { ascending: true }),
      supabase
        .from('timeline_events')
        .select('*')
        .eq('household_id', profile.household_id)
        .gte('created_at', todayRange.start)
        .lt('created_at', todayRange.end)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (activityResult.data) setActivities(activityResult.data as ActivityLog[])
    if (plannedResult.data) setPlannedActivities(plannedResult.data as PlannedActivity[])
    if (timelineResult.data) setTimelineEvents(timelineResult.data as TimelineEvent[])
  }, [profile.household_id, profile.timezone, supabase])

  // Subscribe to realtime activity updates
  useEffect(() => {
    trackClientEvent('mci_dashboard_viewed', {
      activity_count: initialActivities.length,
      planned_activity_count: initialPlannedActivities.length,
    })

    const channel = supabase
      .channel('activity-logs')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_logs',
        filter: `household_id=eq.${profile.household_id}`,
      }, payload => {
        const created = payload.new as ActivityLog
        if (getLocalDateKey(new Date(created.occurred_at), profile.timezone) !== getLocalDateKey(new Date(), profile.timezone)) {
          return
        }
        setActivities(prev => prev.some(activity => activity.id === created.id) ? prev : [created, ...prev])
        scheduleContextCardRefresh()
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'activity_logs',
        filter: `household_id=eq.${profile.household_id}`,
      }, payload => {
        const deleted = payload.old as Partial<ActivityLog>
        setActivities(prev => prev.filter(activity => activity.id !== deleted.id))
        scheduleContextCardRefresh()
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'planned_activities',
        filter: `household_id=eq.${profile.household_id}`,
      }, payload => {
        const created = payload.new as PlannedActivity
        if (created.planned_for !== getLocalDateKey(new Date(), profile.timezone)) return
        setPlannedActivities(prev => prev.some(item => item.id === created.id) ? prev : [...prev, created])
        scheduleContextCardRefresh()
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'planned_activities',
        filter: `household_id=eq.${profile.household_id}`,
      }, payload => {
        const updated = payload.new as PlannedActivity
        setPlannedActivities(prev => {
          if (updated.planned_for !== getLocalDateKey(new Date(), profile.timezone)) {
            return prev.filter(item => item.id !== updated.id)
          }
          return prev.some(item => item.id === updated.id)
            ? prev.map(item => item.id === updated.id ? updated : item)
            : [...prev, updated]
        })
        scheduleContextCardRefresh()
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'planned_activities',
        filter: `household_id=eq.${profile.household_id}`,
      }, payload => {
        const deleted = payload.old as Partial<PlannedActivity>
        setPlannedActivities(prev => prev.filter(item => item.id !== deleted.id))
        scheduleContextCardRefresh()
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'timeline_events',
        filter: `household_id=eq.${profile.household_id}`,
      }, payload => {
        const created = payload.new as TimelineEvent
        if (getLocalDateKey(new Date(created.created_at), profile.timezone) !== getLocalDateKey(new Date(), profile.timezone)) {
          return
        }
        setTimelineEvents(prev => prev.some(event => event.id === created.id) ? prev : [created, ...prev])
      })
      .subscribe()

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshDashboardData()
      }
    }
    const refreshWhenFocused = () => {
      refreshDashboardData()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenFocused)
    const refreshTimer = window.setInterval(refreshDashboardData, 30_000)
    const clockTimer = window.setInterval(() => setClockNow(new Date()), 30_000)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenFocused)
      window.clearInterval(refreshTimer)
      window.clearInterval(clockTimer)
    }
  }, [profile.household_id, profile.timezone, initialActivities.length, initialPlannedActivities.length, supabase, refreshDashboardData, scheduleContextCardRefresh])

  const handleNaturalPlansSaved = useCallback((items: PlannedActivity[]) => {
    setPlannedActivities(prev => {
      const updated = prev.map(existing => items.find(item => item.id === existing.id) ?? existing)
      return [
        ...updated,
        ...items.filter(item => item.planned_for === todayKey && !prev.some(existing => existing.id === item.id)),
      ]
    })
    scheduleContextCardRefresh()
  }, [scheduleContextCardRefresh, todayKey])

  const handleTimelineSaved = useCallback((event: TimelineEvent) => {
    setTimelineEvents(prev => prev.some(item => item.id === event.id) ? prev : [event, ...prev])
  }, [])

  async function openRecall() {
    setRecallOpen(true)
    setRecallLoading(true)
    setRecallAnswer(null)
    setRecallResolved(null)
    setRecallCorrection('')
    try {
      const response = await fetch('/api/reentry', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) {
        setRecallAnswer({
          confidence: 'unknown',
          confidenceLabel: 'Not sure',
          answer: "I don't have a note for the last little while.",
          source: 'Tell me, and I will remember it.',
          asksConfirmation: false,
        })
        return
      }
      setRecallAnswer(result)
    } catch {
      setRecallAnswer({
        confidence: 'unknown',
        confidenceLabel: 'Not sure',
        answer: "I don't have a note for the last little while.",
        source: 'Tell me, and I will remember it.',
        asksConfirmation: false,
      })
    } finally {
      setRecallLoading(false)
    }
  }

  async function saveRecallCorrection(text: string, type: 'doing_now' | 'did' = 'did') {
    const value = text.trim()
    if (!value) return
    setRecallSaving(true)
    try {
      const response = await fetch('/api/timeline-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: value,
          type,
          source: 'user-stated',
          confidence: 'high',
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (response.ok && result.event) handleTimelineSaved(result.event)
      setRecallResolved('yes')
    } finally {
      setRecallSaving(false)
    }
  }

  const handlePlanAction = useCallback(async (plannedActivity: PlannedActivity, action: 'confirm' | 'not_now' | 'skipped' | 'reopen' | 'delete') => {
    if (action === 'confirm') {
      if (confirmingPlanIds.includes(plannedActivity.id)) return
      setConfirmingPlanIds(current => [...current, plannedActivity.id])
    }

    let res: Response
    try {
      res = await fetch('/api/planned-activities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plannedActivity.id, action }),
      })
    } catch {
      setConfirmingPlanIds(current => current.filter(id => id !== plannedActivity.id))
      return
    }

    if (!res.ok) {
      setConfirmingPlanIds(current => current.filter(id => id !== plannedActivity.id))
      return
    }

    const result: {
      plannedActivity: PlannedActivity | null
      activity: ActivityLog | null
      deleted_planned_activity_id?: string | null
      deleted_activity_id?: string | null
    } = await res.json()

    if (result.deleted_planned_activity_id) {
      setPlannedActivities(prev => prev.filter(item => item.id !== result.deleted_planned_activity_id))
    } else if (result.plannedActivity) {
      setPlannedActivities(prev => prev.map(item => item.id === result.plannedActivity!.id ? result.plannedActivity! : item))
    }

    if (result.deleted_activity_id) {
      setActivities(prev => prev.filter(activity => activity.id !== result.deleted_activity_id))
    }

    if (!result.activity) {
      setConfirmingPlanIds(current => current.filter(id => id !== plannedActivity.id))
      scheduleContextCardRefresh()
      return
    }

    setActivities(prev => prev.some(activity => activity.id === result.activity!.id) ? prev : [result.activity!, ...prev])
    setConfirmingPlanIds(current => current.filter(id => id !== plannedActivity.id))
    scheduleContextCardRefresh()
  }, [confirmingPlanIds, scheduleContextCardRefresh])

  async function handleMoveConfirmed() {
    if (!moveCandidate || !moveDate) return
    setMoveError(null)
    const response = await fetch('/api/planned-activities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: moveCandidate.id, action: 'move', planned_for: moveDate }),
    })
    const result = await response.json()
    if (!response.ok) {
      setMoveError(result.error ?? 'Could not move this task. Please try again.')
      return
    }
    setPlannedActivities(current => current.map(item => item.id === moveCandidate.id ? result.plannedActivity : item))
    setMoveCandidate(null)
    setMoveDate('')
    scheduleContextCardRefresh()
  }

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteCandidate) return
    setDeletingPlanId(deleteCandidate.id)
    try {
      await handlePlanAction(deleteCandidate, 'delete')
      setDeleteCandidate(null)
    } finally {
      setDeletingPlanId(null)
    }
  }, [deleteCandidate, handlePlanAction])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const todayActivities = activities
    .filter(activity => getLocalDateKey(new Date(activity.occurred_at), profile.timezone) === todayKey)
  const displayActivities = suppressNearbyDuplicateActivities(todayActivities, plannedActivities)

  const sortedPlannedActivities = [...plannedActivities].sort((a, b) => {
    const periodDiff = (PERIOD_ORDER[a.expected_period] ?? 9) - (PERIOD_ORDER[b.expected_period] ?? 9)
    if (periodDiff !== 0) return periodDiff
    if (a.expected_time && b.expected_time && a.expected_time !== b.expected_time) {
      return a.expected_time.localeCompare(b.expected_time)
    }
    if (a.expected_time && !b.expected_time) return -1
    if (!a.expected_time && b.expected_time) return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const visiblePlannedActivities = sortedPlannedActivities.filter(item => item.status !== 'confirmed')
  const openPlannedCount = sortedPlannedActivities.filter(a => a.status === 'planned' || a.status === 'not_now').length
  const recentTimeline = timelineEvents.find(event => event.type === 'doing_now' || event.type === 'did' || event.type === 'sms_reply')
  const recentActivity = recentTimeline?.text
    ? recentTimeline.text
    : displayActivities[0]?.note?.trim() || displayActivities[0]?.label || 'No recent note yet'
  const recentActivityTime = recentTimeline
    ? (recentTimeline.type === 'doing_now' ? 'now' : 'earlier')
    : displayActivities[0]
    ? 'earlier'
    : ''
  const nextPlan = visiblePlannedActivities.find(item => item.status === 'planned' || item.status === 'not_now') ?? null
  const nextPlanName = nextPlan?.note?.trim() || nextPlan?.label || 'Nothing waiting'
  const nextPlanTime = nextPlan
    ? formatTaskTiming(nextPlan.expected_time, nextPlan.expected_period).split(' · ')[0]
    : ''
  const carePartnerFirstName = carePartner?.display_name?.trim().split(/\s+/)[0] || 'care partner'

  return (
    <div className="min-h-svh bg-cream-50 pb-8 safe-bottom">
      <div className="bg-[#FBF5E9] border-b border-cream-200 safe-top">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-sage-600 font-semibold">
              <span className="w-7 h-7 rounded-full bg-sage-100 flex items-center justify-center" aria-hidden="true">⌁</span>
              <span>Context</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHousehold(true)}
                className="w-11 h-11 rounded-full bg-cream-100 flex items-center justify-center text-lg hover:bg-cream-200 focus:outline-none focus:ring-2 focus:ring-sage-300 transition-colors"
                title="Household"
                aria-label="Open household"
              >
                🏡
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="w-11 h-11 rounded-full bg-cream-100 flex items-center justify-center text-lg hover:bg-cream-200 focus:outline-none focus:ring-2 focus:ring-sage-300 transition-colors"
                title="Settings"
                aria-label="Open settings"
              >
                ⚙
              </button>
            </div>
          </div>
          <p className="text-xl font-semibold text-warm-400">{greeting}, {profile.display_name}</p>
          <h1 className="mt-1 font-serif text-[2rem] leading-tight font-semibold text-warm-900">
            It's {orientationTime},<br />
            {weekday} {partOfDay}.
          </h1>
          <p className="sr-only">{dateStr}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 space-y-5 pt-5">

        <NaturalLanguagePlanComposer
          plannedFor={todayKey}
          onSaved={handleNaturalPlansSaved}
          onTimelineSaved={handleTimelineSaved}
        />

        <div className="rounded-[20px] border-2 border-cream-300 bg-white px-5 shadow-card">
          <div className="flex items-center gap-3 py-4">
            <span className="w-8 h-8 shrink-0 rounded-full bg-sage-100 text-sage-600 flex items-center justify-center font-semibold" aria-hidden="true">✓</span>
            <p className="min-w-0 flex-1 font-serif text-xl font-semibold leading-6 text-warm-900 break-words">{recentActivity}</p>
            {recentActivityTime && <span className="text-sm font-semibold text-warm-400">{recentActivityTime}</span>}
          </div>
          <div className="flex items-center gap-3 border-t border-cream-200 py-4">
            <span className="w-8 h-8 shrink-0 rounded-full bg-cream-200 text-terracotta-600 flex items-center justify-center font-semibold" aria-hidden="true">→</span>
            <p className="min-w-0 flex-1 font-serif text-xl font-semibold leading-6 text-warm-900 break-words">{nextPlanName}</p>
            {nextPlanTime && <span className="text-sm font-semibold text-warm-400">{nextPlanTime}</span>}
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={openRecall}
            className="w-full min-h-[68px] rounded-[18px] bg-sage-600 px-5 text-xl font-semibold text-white shadow-card active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-sage-300/70 transition-all"
          >
            What was I doing?
          </button>
          {carePartner?.phone_e164 ? (
            <a
              href={`tel:${carePartner.phone_e164}`}
              className="w-full min-h-[60px] rounded-[18px] border-2 border-cream-300 bg-cream-200 px-5 text-lg font-semibold text-warm-900 flex items-center justify-center gap-2 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-sage-300/60 transition-all"
            >
              <span aria-hidden="true">☎</span>
              Call {carePartnerFirstName}
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="w-full min-h-[60px] rounded-[18px] border-2 border-cream-300 bg-cream-100 px-5 text-lg font-semibold text-warm-400"
            >
              Call care partner
            </button>
          )}
        </div>

        {/* Today's Plan */}
        <div id="todays-plan" tabIndex={-1} className="animate-fade-up scroll-mt-4 focus:outline-none">
          <div className="flex items-center justify-between mb-3">
            <p className="text-warm-900 text-lg font-semibold">Today's plan</p>
            {openPlannedCount > 0 && (
              <span className="text-xs text-warm-400">{openPlannedCount} waiting</span>
            )}
          </div>
          {visiblePlannedActivities.length === 0 ? (
            <div className="card p-5 text-center border border-cream-100">
              <p className="text-warm-400 text-sm">Nothing planned yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visiblePlannedActivities.map(item => {
                const tile = ACTIVITY_TILES.find(t => t.category === item.category)
                const isSkipped = item.status === 'skipped'
                const taskName = item.note?.trim() || item.label
                const categoryName = tile?.label ?? item.label
                return (
                  <div key={item.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border border-cream-100">
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{tile?.icon ?? '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-base font-semibold leading-5 text-warm-900 whitespace-normal break-words">{taskName}</p>
                            <p className="text-xs leading-5 text-warm-400 mt-1">
                              {item.category !== 'custom' && `${categoryName} · `}
                              {formatTaskTiming(item.expected_time, item.expected_period)}
                              {item.repeat_rule && item.repeat_rule !== 'none' ? ` · ${REPEAT_LABELS[item.repeat_rule]}` : ''}
                            </p>
                          </div>
                          <span className={`text-[11px] rounded-pill px-2 py-0.5 whitespace-nowrap ${
                            item.status === 'not_now'
                              ? 'bg-cream-200 text-warm-600'
                              : isSkipped
                              ? 'bg-cream-100 text-warm-300'
                              : 'bg-terracotta-50 text-terracotta-600'
                          }`}>
                            {item.status === 'not_now' ? 'Later' : isSkipped ? 'Skipped' : 'Planned'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {!isSkipped ? (
                      <>
                      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 mt-3">
                        <button
                          onClick={() => handlePlanAction(item, 'confirm')}
                          disabled={confirmingPlanIds.includes(item.id)}
                          className="min-h-12 rounded-xl bg-sage-100 text-sage-600 py-2 text-sm font-semibold active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-sage-300 transition-all disabled:opacity-60"
                        >
                          {confirmingPlanIds.includes(item.id) ? 'Saving...' : 'Mark done'}
                        </button>
                        <button
                          onClick={() => { setMoveCandidate(item); setMoveDate(tomorrowKey); setMoveError(null) }}
                          className="min-h-12 rounded-xl border border-warm-200 text-warm-600 py-2 text-sm font-medium active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-sage-300 transition-all"
                        >
                          Move →
                        </button>
                        <button
                          onClick={() => setOpenMoreId(current => current === item.id ? null : item.id)}
                          className="min-h-12 rounded-xl border border-warm-200 text-warm-600 py-2 text-sm font-medium active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-sage-300 transition-all"
                        >
                          More
                        </button>
                      </div>
                      {openMoreId === item.id && (
                        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-cream-100 p-2">
                          <button onClick={() => { setEditCandidate(item); setOpenMoreId(null) }} className="min-h-11 rounded-lg bg-white text-sm font-medium text-warm-700">Edit task</button>
                          <button onClick={() => { setDeleteCandidate(item); setOpenMoreId(null) }} className="min-h-11 rounded-lg bg-white text-sm font-medium text-terracotta-700">Delete task</button>
                        </div>
                      )}
                      </>
                    ) : (
                      <div className="mt-3">
                        <button
                          onClick={() => setDeleteCandidate(item)}
                          className="w-full rounded-xl border border-terracotta-200 text-terracotta-700 py-2 text-sm font-medium active:scale-[0.98] transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {recallOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-warm-900/35 px-0" role="dialog" aria-modal="true" aria-labelledby="recall-title">
          <div className="w-full max-w-lg mx-auto rounded-t-3xl bg-[#FBF5E9] px-5 pb-8 pt-4 shadow-float safe-bottom">
            <div className="w-10 h-1 bg-warm-300/50 rounded-pill mx-auto mb-5" />
            <button
              type="button"
              onClick={() => setRecallOpen(false)}
              className="mb-4 min-h-11 rounded-xl px-1 text-base font-semibold text-warm-500 focus:outline-none focus:ring-2 focus:ring-sage-300"
            >
              ‹ Back to home
            </button>
            {recallLoading ? (
              <div className="rounded-[22px] border-2 border-cream-300 bg-white p-5 shadow-card animate-pulse-soft">
                <div className="h-5 w-28 rounded-pill bg-cream-200 mb-4" />
                <div className="h-7 w-4/5 rounded-pill bg-cream-200 mb-3" />
                <div className="h-4 w-full rounded-pill bg-cream-200" />
              </div>
            ) : recallResolved === 'yes' ? (
              <div className="rounded-[22px] border-2 border-cream-300 bg-white p-5 shadow-card">
                <p id="recall-title" className="text-xs font-bold uppercase tracking-wide text-sage-600">All caught up</p>
                <p className="mt-3 font-serif text-2xl font-semibold leading-8 text-warm-900">
                  Good. You're all caught up.
                </p>
                <p className="mt-3 text-base font-medium leading-6 text-warm-500">
                  I'll keep things ready for you.
                </p>
                <button
                  type="button"
                  onClick={() => setRecallOpen(false)}
                  className="mt-5 w-full min-h-[60px] rounded-xl bg-sage-600 text-lg font-semibold text-white focus:outline-none focus:ring-4 focus:ring-sage-300/70"
                >
                  Back to home
                </button>
              </div>
            ) : recallResolved === 'no' ? (
              <div className="rounded-[22px] border-2 border-cream-300 bg-white p-5 shadow-card">
                <p id="recall-title" className="font-serif text-2xl font-semibold leading-8 text-warm-900">Thanks, that helps.</p>
                <label htmlFor="recall-correction" className="mt-4 block text-base font-semibold text-warm-700">
                  What were you doing?
                </label>
                <input
                  id="recall-correction"
                  value={recallCorrection}
                  onChange={event => setRecallCorrection(event.target.value)}
                  placeholder="I was..."
                  className="mt-3 min-h-14 w-full rounded-xl border-2 border-cream-300 bg-cream-50 px-4 text-lg font-semibold text-warm-900 placeholder:text-warm-300 focus:outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
                />
                <button
                  type="button"
                  onClick={() => saveRecallCorrection(recallCorrection)}
                  disabled={recallSaving || !recallCorrection.trim()}
                  className="mt-5 w-full min-h-[60px] rounded-xl bg-sage-600 text-lg font-semibold text-white disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-sage-300/70"
                >
                  {recallSaving ? 'Saving...' : 'Save and go home'}
                </button>
              </div>
            ) : recallAnswer ? (
              <div className="rounded-[22px] border-2 border-cream-300 bg-white p-5 shadow-card">
                <p id="recall-title" className="text-xs font-bold uppercase tracking-wide text-sage-600">Your day so far</p>
                <span className={`mt-4 inline-flex items-center gap-2 rounded-pill px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  recallAnswer.confidence === 'certain'
                    ? 'bg-sage-100 text-sage-600'
                    : recallAnswer.confidence === 'guess'
                    ? 'bg-cream-200 text-terracotta-700'
                    : 'bg-warm-100 text-warm-500'
                }`}>
                  <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true" />
                  {recallAnswer.confidenceLabel}
                </span>
                <p className="mt-4 font-serif text-2xl font-semibold leading-8 text-warm-900">
                  {recallAnswer.answer}
                </p>
                <p className="mt-3 text-base font-medium leading-6 text-warm-500">
                  {recallAnswer.source}
                </p>
                {recallAnswer.confidence === 'unknown' ? (
                  <>
                    <input
                      value={recallCorrection}
                      onChange={event => setRecallCorrection(event.target.value)}
                      placeholder="What are you doing right now?"
                      className="mt-5 min-h-14 w-full rounded-xl border-2 border-cream-300 bg-cream-50 px-4 text-lg font-semibold text-warm-900 placeholder:text-warm-300 focus:outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
                    />
                    <button
                      type="button"
                      onClick={() => saveRecallCorrection(recallCorrection, 'doing_now')}
                      disabled={recallSaving || !recallCorrection.trim()}
                      className="mt-4 w-full min-h-[60px] rounded-xl bg-sage-600 text-lg font-semibold text-white disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-sage-300/70"
                    >
                      {recallSaving ? 'Saving...' : 'Tell Context'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-5 text-lg font-semibold text-warm-800">
                      {recallAnswer.confidence === 'guess' ? 'Does that sound right?' : 'Is that right?'}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRecallResolved('yes')}
                        className="min-h-[60px] rounded-xl bg-sage-500 text-lg font-semibold text-white focus:outline-none focus:ring-4 focus:ring-sage-300/70"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecallResolved('no')}
                        className="min-h-[60px] rounded-xl border-2 border-cream-300 bg-white text-lg font-semibold text-warm-800 focus:outline-none focus:ring-4 focus:ring-sage-300/60"
                      >
                        No
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Reminder Settings Sheet */}
      {showSettings && (
        <ReminderSettings
          profile={profile}
          onClose={() => setShowSettings(false)}
          onSignOut={handleSignOut}
        />
      )}

      {/* Household Code Sheet */}
      {showHousehold && household && (
        <HouseholdCode
          household={household}
          onClose={() => setShowHousehold(false)}
        />
      )}

      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-warm-900/35 px-5 flex items-center justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-float border border-cream-200">
            <p className="font-serif text-lg font-semibold text-warm-900">Delete this task?</p>
            <p className="text-sm text-warm-500 mt-2">
              This removes "{deleteCandidate.note || deleteCandidate.label}" from today's plan.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="rounded-xl border border-warm-200 text-warm-600 py-2.5 text-sm font-medium active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirmed}
                disabled={deletingPlanId === deleteCandidate.id}
                className="rounded-xl bg-terracotta-600 text-cream-50 py-2.5 text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {deletingPlanId === deleteCandidate.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {editCandidate && (
        <EditTaskSheet task={editCandidate}
          onClose={() => setEditCandidate(null)}
          onSaved={updated => {
            setPlannedActivities(current => current.map(item => item.id === updated.id ? updated : item))
            setEditCandidate(null)
            scheduleContextCardRefresh()
          }}
          onDelete={() => { setDeleteCandidate(editCandidate); setEditCandidate(null) }} />
      )}
      {moveCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/35 px-5" role="dialog" aria-modal="true" aria-labelledby="move-task-title">
          <div className="w-full max-w-sm rounded-2xl border border-cream-200 bg-white p-5 shadow-float">
            <h2 id="move-task-title" className="font-serif text-xl font-semibold text-warm-900">Move this task?</h2>
            <p className="mt-2 text-base leading-6 text-warm-600">{moveCandidate.note || moveCandidate.label}</p>
            <label htmlFor="move-date" className="mt-4 block text-sm font-medium text-warm-600">New day</label>
            <input id="move-date" type="date" min={tomorrowKey} value={moveDate} onChange={event => setMoveDate(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-cream-300 px-3 text-base text-warm-800" />
            <p className="mt-2 text-sm text-warm-400">
              {moveDate === tomorrowKey
                ? `Tomorrow, ${new Date(`${tomorrowKey}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`
                : 'Choose any future day.'}
            </p>
            {moveError && <p className="mt-3 text-sm font-medium text-terracotta-700">{moveError}</p>}
            <button onClick={handleMoveConfirmed} className="mt-5 min-h-12 w-full rounded-xl bg-warm-700 text-base font-medium text-cream-50">Move task</button>
            <button onClick={() => { setMoveCandidate(null); setMoveError(null) }} className="mt-2 min-h-11 w-full text-sm font-medium text-warm-500">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
