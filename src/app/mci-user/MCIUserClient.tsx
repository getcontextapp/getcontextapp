'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { trackClientEvent } from '@/lib/client-analytics'
import { getLocalDateKey, getUtcRangeForLocalDay } from '@/lib/dates'
import { ACTIVITY_TILES } from '@/types'
import type { Profile, ActivityLog, ContextCard, ActivityTileConfig, PlannedActivity } from '@/types'
import ActivityLogModal from '@/components/mci/ActivityLogModal'
import ContextCardDisplay from '@/components/mci/ContextCardDisplay'
import HouseholdCode from '@/components/mci/HouseholdCode'
import ReminderSettings from '@/components/mci/ReminderSettings'
import NaturalLanguagePlanComposer from '@/components/mci/NaturalLanguagePlanComposer'

interface Props {
  profile: Profile
  initialActivities: ActivityLog[]
  initialPlannedActivities: PlannedActivity[]
  initialContextCard: ContextCard | null
  household: { join_code: string; name: string } | null
}

const PERIOD_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
}

const PERIOD_ORDER: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  anytime: 3,
}

export default function MCIUserClient({ profile, initialActivities, initialPlannedActivities, initialContextCard, household }: Props) {
  const [supabase] = useState(createClient)

  const [activities, setActivities] = useState<ActivityLog[]>(initialActivities)
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>(initialPlannedActivities)
  const [contextCard, setContextCard] = useState<ContextCard | null>(initialContextCard)
  const [selectedTile, setSelectedTile] = useState<ActivityTileConfig | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showHousehold, setShowHousehold] = useState(false)
  const [generatingCard, setGeneratingCard] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<PlannedActivity | null>(null)
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null)
  const [confirmingPlanIds, setConfirmingPlanIds] = useState<string[]>([])
  const [contextCardCollapsed, setContextCardCollapsed] = useState(false)
  const [manualTilesExpanded, setManualTilesExpanded] = useState(initialPlannedActivities.length === 0)
  const contextCardRequestId = useRef(0)
  const contextCardDismissed = useRef(false)
  const contextCardRefreshTimer = useRef<number | null>(null)

  const now = new Date()
  const localHour = Number(now.toLocaleString('en-US', {
    timeZone: profile.timezone,
    hour: 'numeric',
    hour12: false,
  }))
  const greeting = localHour < 12 ? 'Good morning' : localHour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: profile.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const todayKey = getLocalDateKey(now, profile.timezone)

  const refreshContextCard = useCallback(async (showAfterDataChange = false) => {
    const requestId = ++contextCardRequestId.current
    setGeneratingCard(true)
    try {
      const res = await fetch('/api/context-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (requestId !== contextCardRequestId.current) return

      if (res.ok) {
        const card = await res.json()
        if (contextCardDismissed.current && !showAfterDataChange) return
        contextCardDismissed.current = false
        setContextCard(card)
      } else {
        setContextCard(null)
      }
    } catch {
      if (requestId === contextCardRequestId.current) setContextCard(null)
    } finally {
      if (requestId === contextCardRequestId.current) setGeneratingCard(false)
    }
  }, [])

  const scheduleContextCardRefresh = useCallback(() => {
    if (contextCardRefreshTimer.current) window.clearTimeout(contextCardRefreshTimer.current)
    contextCardRefreshTimer.current = window.setTimeout(() => {
      contextCardRefreshTimer.current = null
      refreshContextCard(true)
    }, 500)
  }, [refreshContextCard])

  const refreshDashboardData = useCallback(async () => {
    const todayRange = getUtcRangeForLocalDay(new Date(), profile.timezone)
    const [activityResult, plannedResult] = await Promise.all([
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
    ])

    if (activityResult.data) setActivities(activityResult.data as ActivityLog[])
    if (plannedResult.data) setPlannedActivities(plannedResult.data as PlannedActivity[])
  }, [profile.household_id, profile.timezone, supabase])

  // Subscribe to realtime activity updates
  useEffect(() => {
    trackClientEvent('mci_dashboard_viewed', {
      activity_count: initialActivities.length,
      planned_activity_count: initialPlannedActivities.length,
      has_context_card: Boolean(initialContextCard),
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
      .subscribe()

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshDashboardData()
        refreshContextCard()
      }
    }
    const refreshWhenFocused = () => {
      refreshDashboardData()
      refreshContextCard()
    }
    refreshContextCard(true)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenFocused)
    const refreshTimer = window.setInterval(refreshDashboardData, 30_000)
    const reflectionTimer = window.setInterval(refreshContextCard, 5 * 60_000)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenFocused)
      window.clearInterval(refreshTimer)
      window.clearInterval(reflectionTimer)
      if (contextCardRefreshTimer.current) window.clearTimeout(contextCardRefreshTimer.current)
    }
  }, [profile.household_id, profile.timezone, initialActivities.length, initialPlannedActivities.length, initialContextCard, supabase, refreshContextCard, refreshDashboardData, scheduleContextCardRefresh])

  const handleActivityPlanned = useCallback((activity: PlannedActivity) => {
    setPlannedActivities(prev => [...prev, activity])
    setSelectedTile(null)
    setManualTilesExpanded(false)
    scheduleContextCardRefresh()
  }, [scheduleContextCardRefresh])

  const handleNaturalPlansSaved = useCallback((items: PlannedActivity[]) => {
    setPlannedActivities(prev => [
      ...prev,
      ...items.filter(item => !prev.some(existing => existing.id === item.id)),
    ])
    setManualTilesExpanded(false)
    scheduleContextCardRefresh()
  }, [scheduleContextCardRefresh])

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

  const dismissContextCard = useCallback(async () => {
    if (!contextCard) return
    trackClientEvent('context_card_dismissed', {
      card_id: contextCard.id,
      card_type: contextCard.type,
    })
    contextCardDismissed.current = true
    setContextCard(null)
  }, [contextCard])

  const showWaitingTasks = useCallback(() => {
    const plan = document.getElementById('todays-plan')
    plan?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => plan?.focus({ preventScroll: true }), 350)
  }, [])

  useEffect(() => {
    if (!contextCard || contextCardCollapsed) return

    let timer = window.setTimeout(() => setContextCardCollapsed(true), 30_000)
    const restartTimer = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setContextCardCollapsed(true), 30_000)
    }

    window.addEventListener('pointerdown', restartTimer)
    window.addEventListener('keydown', restartTimer)
    window.addEventListener('scroll', restartTimer, { passive: true })

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', restartTimer)
      window.removeEventListener('keydown', restartTimer)
      window.removeEventListener('scroll', restartTimer)
    }
  }, [contextCard, contextCardCollapsed])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const linkedActivityIds = new Set(
    plannedActivities
      .map(item => item.confirmed_activity_log_id)
      .filter((id): id is string => Boolean(id)),
  )
  const normalizedActivityName = (activity: ActivityLog) =>
    `${activity.category}:${activity.note?.trim() || activity.label}`.toLowerCase().replace(/\s+/g, ' ')
  const todayActivities = activities
    .filter(activity => getLocalDateKey(new Date(activity.occurred_at), profile.timezone) === todayKey)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
  const displayActivities = todayActivities.filter((activity, index, all) => {
    const nearbyDuplicates = all
      .map((other, otherIndex) => ({ other, otherIndex }))
      .filter(({ other, otherIndex }) => {
        if (otherIndex === index || normalizedActivityName(other) !== normalizedActivityName(activity)) return false
        const timeDifference = Math.abs(
          new Date(other.occurred_at).getTime() - new Date(activity.occurred_at).getTime(),
        )
        return timeDifference <= 2 * 60 * 1000
      })

    if (linkedActivityIds.has(activity.id)) {
      return !nearbyDuplicates.some(({ other, otherIndex }) =>
        otherIndex < index && linkedActivityIds.has(other.id),
      )
    }

    return !nearbyDuplicates.some(({ other, otherIndex }) =>
      linkedActivityIds.has(other.id) || otherIndex < index,
    )
  })

  // Group today's activities by time of day.
  const groupedActivities = displayActivities.reduce<Record<string, ActivityLog[]>>((acc, a) => {
    const h = Number(new Date(a.occurred_at).toLocaleString('en-US', {
      timeZone: profile.timezone,
      hour: 'numeric',
      hour12: false,
    }))
    const period = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
    if (!acc[period]) acc[period] = []
    acc[period].push(a)
    return acc
  }, {})

  const sortedPlannedActivities = [...plannedActivities].sort((a, b) => {
    const periodDiff = (PERIOD_ORDER[a.expected_period] ?? 9) - (PERIOD_ORDER[b.expected_period] ?? 9)
    if (periodDiff !== 0) return periodDiff
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const visiblePlannedActivities = sortedPlannedActivities.filter(item => item.status !== 'confirmed')
  const openPlannedCount = sortedPlannedActivities.filter(a => a.status === 'planned' || a.status === 'not_now').length

  return (
    <div className="min-h-svh bg-cream-50 pb-8 safe-bottom">
      {/* Header */}
      <div className="bg-cream-100 border-b border-cream-200 safe-top">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-warm-400 text-xs font-medium uppercase tracking-wide">{dateStr}</p>
            <h1 className="font-serif text-lg font-semibold text-warm-900 leading-tight">
              {greeting}, {profile.display_name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHousehold(true)}
              className="w-9 h-9 rounded-full bg-cream-200 flex items-center justify-center text-lg hover:bg-cream-300 transition-colors"
              title="Household"
            >
              🏡
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="w-9 h-9 rounded-full bg-cream-200 flex items-center justify-center text-lg hover:bg-cream-300 transition-colors"
              title="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 space-y-6 pt-5">

        <NaturalLanguagePlanComposer
          plannedFor={todayKey}
          onSaved={handleNaturalPlansSaved}
        />

        {/* Today's Plan */}
        <div id="todays-plan" tabIndex={-1} className="animate-fade-up scroll-mt-4 focus:outline-none">
          <div className="flex items-center justify-between mb-3">
            <p className="text-warm-500 text-sm font-medium">Today's plan</p>
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
                              {PERIOD_LABELS[item.expected_period] ?? 'Anytime'}
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
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <button
                          onClick={() => handlePlanAction(item, 'confirm')}
                          disabled={confirmingPlanIds.includes(item.id)}
                          className="rounded-xl bg-warm-700 text-cream-100 py-2 text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-60"
                        >
                          {confirmingPlanIds.includes(item.id) ? 'Saving...' : 'Done'}
                        </button>
                        <button
                          onClick={() => handlePlanAction(item, 'not_now')}
                          className="rounded-xl border border-warm-200 text-warm-600 py-2 text-sm font-medium active:scale-[0.98] transition-all"
                        >
                          Not yet
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(item)}
                          className="rounded-xl border border-terracotta-200 text-terracotta-700 py-2 text-sm font-medium active:scale-[0.98] transition-all"
                        >
                          Delete
                        </button>
                      </div>
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

        {/* Context Card */}
        {contextCard ? (
          <ContextCardDisplay
            card={contextCard}
            isGenerating={generatingCard}
            collapsed={contextCardCollapsed}
            onExpand={() => setContextCardCollapsed(false)}
            onShowWaiting={showWaitingTasks}
            onDismiss={dismissContextCard}
            pendingCount={openPlannedCount}
            timeZone={profile.timezone}
          />
        ) : generatingCard ? (
          <div className="card p-5 animate-pulse-soft">
            <div className="h-4 bg-cream-200 rounded-pill w-1/3 mb-3" />
            <div className="h-3 bg-cream-200 rounded-pill w-full mb-2" />
            <div className="h-3 bg-cream-200 rounded-pill w-4/5" />
          </div>
        ) : null}

        {/* Confirmed Timeline */}
        {displayActivities.length > 0 && (
          <div className="animate-fade-up">
            <p className="text-warm-500 text-sm font-medium mb-3">Confirmed today</p>
            <div className="space-y-4">
              {(['Morning', 'Afternoon', 'Evening'] as const).map(period => {
                const group = groupedActivities[period]
                if (!group || group.length === 0) return null
                return (
                  <div key={period}>
                    <p className="text-xs font-medium text-warm-300 uppercase tracking-wide mb-2">{period}</p>
                    <div className="space-y-2">
                      {group.map(a => {
                        const tileConfig = ACTIVITY_TILES.find(t => t.category === a.category)
                        const linkedPlan = plannedActivities.find(item =>
                          item.status === 'confirmed' && item.confirmed_activity_log_id === a.id
                        )
                        const timeStr = new Date(a.occurred_at).toLocaleTimeString('en-US', {
                          timeZone: profile.timezone,
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })
                        const taskName = a.note?.trim() || a.label
                        return (
                          <div key={a.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border border-cream-100">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{tileConfig?.icon ?? '📌'}</span>
                              <p className="flex-1 min-w-0 text-base font-semibold leading-5 text-warm-900 whitespace-normal break-words">{taskName}</p>
                              <span className="text-xs text-warm-300 whitespace-nowrap">{timeStr}</span>
                            </div>
                            {linkedPlan && (
                              <div className="grid grid-cols-2 gap-2 mt-3">
                                <button
                                  onClick={() => handlePlanAction(linkedPlan, 'reopen')}
                                  className="rounded-xl border border-warm-200 text-warm-600 py-2 text-sm font-medium active:scale-[0.98] transition-all"
                                >
                                  Undo done
                                </button>
                                <button
                                  onClick={() => setDeleteCandidate(linkedPlan)}
                                  className="rounded-xl border border-terracotta-200 text-terracotta-700 py-2 text-sm font-medium active:scale-[0.98] transition-all"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Activity Tiles Grid */}
        <div className="animate-fade-up">
          <button
            type="button"
            onClick={() => setManualTilesExpanded(current => !current)}
            className="w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-3
                       flex items-center justify-between text-left active:scale-[0.99] transition-all"
            aria-expanded={manualTilesExpanded}
          >
            <span className="text-sm font-medium text-warm-600">＋ Add one thing manually</span>
            <span className="text-warm-400" aria-hidden="true">{manualTilesExpanded ? '⌃' : '⌄'}</span>
          </button>
          {manualTilesExpanded && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {ACTIVITY_TILES.map((tile, i) => (
                <button
                  key={tile.category}
                  onClick={() => setSelectedTile(tile)}
                  className={`${tile.colorClass} border rounded-xl p-3 text-left
                              opacity-90 hover:opacity-100 active:scale-[0.96] transition-all
                              animate-fade-up`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <span className="text-xl block mb-1">{tile.icon}</span>
                  <span className="text-xs font-medium text-warm-700">{tile.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity Log Modal */}
      {selectedTile && (
        <ActivityLogModal
          tile={selectedTile}
          plannedFor={todayKey}
          onPlanned={handleActivityPlanned}
          onClose={() => setSelectedTile(null)}
        />
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
    </div>
  )
}
