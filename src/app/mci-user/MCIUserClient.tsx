'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { trackClientEvent } from '@/lib/client-analytics'
import { getLocalDateKey } from '@/lib/dates'
import { ACTIVITY_TILES } from '@/types'
import type { Profile, ActivityLog, ContextCard, ActivityTileConfig, PlannedActivity } from '@/types'
import ActivityLogModal from '@/components/mci/ActivityLogModal'
import ContextCardDisplay from '@/components/mci/ContextCardDisplay'
import HouseholdCode from '@/components/mci/HouseholdCode'
import ReminderSettings from '@/components/mci/ReminderSettings'

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
  const supabase = createClient()

  const [activities, setActivities] = useState<ActivityLog[]>(initialActivities)
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>(initialPlannedActivities)
  const [contextCard, setContextCard] = useState<ContextCard | null>(initialContextCard)
  const [selectedTile, setSelectedTile] = useState<ActivityTileConfig | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showHousehold, setShowHousehold] = useState(false)
  const [generatingCard, setGeneratingCard] = useState(false)

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const todayKey = getLocalDateKey(now, profile.timezone)

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
        setActivities(prev => [payload.new as ActivityLog, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile.household_id, initialActivities.length, initialPlannedActivities.length, initialContextCard, supabase])

  const handleActivityPlanned = useCallback((activity: PlannedActivity) => {
    setPlannedActivities(prev => [...prev, activity])
    setSelectedTile(null)
  }, [])

  const handlePlanAction = useCallback(async (plannedActivity: PlannedActivity, action: 'confirm' | 'not_now' | 'skipped' | 'reopen') => {
    const res = await fetch('/api/planned-activities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: plannedActivity.id, action }),
    })

    if (!res.ok) return

    const result: { plannedActivity: PlannedActivity; activity: ActivityLog | null; deleted_activity_id?: string | null } = await res.json()
    setPlannedActivities(prev => prev.map(item => item.id === result.plannedActivity.id ? result.plannedActivity : item))

    if (result.deleted_activity_id) {
      setActivities(prev => prev.filter(activity => activity.id !== result.deleted_activity_id))
    }

    if (!result.activity) return

    setActivities(prev => [result.activity!, ...prev])

    setGeneratingCard(true)
    try {
      const res = await fetch('/api/context-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_log_id: result.activity.id,
          type: 'open',
        }),
      })
      if (res.ok) {
        const card = await res.json()
        setContextCard(card)
      }
    } catch {
    } finally {
      setGeneratingCard(false)
    }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  // Group today's activities by time of day
  const groupedActivities = activities.reduce<Record<string, ActivityLog[]>>((acc, a) => {
    const h = new Date(a.occurred_at).getHours()
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

        {/* Context Card */}
        {contextCard ? (
          <ContextCardDisplay
            card={contextCard}
            isGenerating={generatingCard}
            onDismiss={async () => {
              await supabase.from('context_cards').update({ is_active: false }).eq('id', contextCard.id)
              trackClientEvent('context_card_dismissed', {
                card_id: contextCard.id,
                card_type: contextCard.type,
              })
              setContextCard(null)
            }}
          />
        ) : generatingCard ? (
          <div className="card p-5 animate-pulse-soft">
            <div className="h-4 bg-cream-200 rounded-pill w-1/3 mb-3" />
            <div className="h-3 bg-cream-200 rounded-pill w-full mb-2" />
            <div className="h-3 bg-cream-200 rounded-pill w-4/5" />
          </div>
        ) : activities.length === 0 && sortedPlannedActivities.length === 0 ? (
          <div className="card p-5 border border-cream-200 animate-fade-up">
            <p className="font-serif text-warm-700 text-base italic">
              "Add one thing to today's plan. You can confirm it later."
            </p>
            <p className="text-warm-300 text-xs mt-2">This keeps the day simple and easy to return to.</p>
          </div>
        ) : null}

        {/* Today's Plan */}
        <div className="animate-fade-up">
          <div className="flex items-center justify-between mb-3">
            <p className="text-warm-500 text-sm font-medium">Today's plan</p>
            {openPlannedCount > 0 && (
              <span className="text-xs text-warm-400">{openPlannedCount} waiting</span>
            )}
          </div>
          {sortedPlannedActivities.length === 0 ? (
            <div className="card p-5 text-center border border-cream-100">
              <p className="text-warm-400 text-sm">Nothing planned yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedPlannedActivities.map(item => {
                const tile = ACTIVITY_TILES.find(t => t.category === item.category)
                const isConfirmed = item.status === 'confirmed'
                const isSkipped = item.status === 'skipped'
                return (
                  <div key={item.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border border-cream-100">
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{tile?.icon ?? '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-warm-800">{tile?.label ?? item.label}</p>
                            {item.note && <p className="text-xs leading-5 text-warm-500 whitespace-normal break-words">{item.note}</p>}
                          </div>
                          <span className={`text-[11px] rounded-pill px-2 py-0.5 whitespace-nowrap ${
                            isConfirmed
                              ? 'bg-sage-100 text-sage-700'
                              : item.status === 'not_now'
                              ? 'bg-cream-200 text-warm-600'
                              : isSkipped
                              ? 'bg-cream-100 text-warm-300'
                              : 'bg-terracotta-50 text-terracotta-600'
                          }`}>
                            {isConfirmed ? 'Done' : item.status === 'not_now' ? 'Later' : isSkipped ? 'Skipped' : 'Planned'}
                          </span>
                        </div>
                        <p className="text-[11px] text-warm-300 mt-1">Expected: {PERIOD_LABELS[item.expected_period] ?? 'Anytime'}</p>
                      </div>
                    </div>
                    {isConfirmed ? (
                      <div className="mt-3">
                        <button
                          onClick={() => handlePlanAction(item, 'reopen')}
                          className="w-full rounded-xl border border-warm-200 text-warm-600 py-2 text-sm font-medium active:scale-[0.98] transition-all"
                        >
                          Undo done
                        </button>
                      </div>
                    ) : !isSkipped && (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button
                          onClick={() => handlePlanAction(item, 'confirm')}
                          className="rounded-xl bg-warm-700 text-cream-100 py-2 text-sm font-medium active:scale-[0.98] transition-all"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => handlePlanAction(item, 'not_now')}
                          className="rounded-xl border border-warm-200 text-warm-600 py-2 text-sm font-medium active:scale-[0.98] transition-all"
                        >
                          Not yet
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Activity Tiles Grid */}
        <div>
          <p className="text-warm-500 text-sm font-medium mb-3">Add something to today</p>
          <div className="grid grid-cols-3 gap-3">
            {ACTIVITY_TILES.map((tile, i) => (
              <button
                key={tile.category}
                onClick={() => setSelectedTile(tile)}
                className={`${tile.colorClass} border-2 rounded-card p-4 text-left
                            hover:shadow-float active:scale-[0.96] transition-all
                            animate-fade-up`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <span className="text-2xl block mb-1.5">{tile.icon}</span>
                <span className="text-sm font-medium text-warm-700">{tile.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Confirmed Timeline */}
        {activities.length > 0 && (
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
                        const timeStr = new Date(a.occurred_at).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })
                        const displayLabel = tileConfig?.label ?? a.label
                        const detail = a.note || (tileConfig && a.label !== tileConfig.label ? a.label : null)
                        return (
                          <div key={a.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-cream-100">
                            <span className="text-xl">{tileConfig?.icon ?? '📌'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-warm-800">{displayLabel}</p>
                              {detail && <p className="text-xs leading-5 text-warm-500 whitespace-normal break-words">{detail}</p>}
                            </div>
                            <span className="text-xs text-warm-300 whitespace-nowrap">{timeStr}</span>
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
    </div>
  )
}
