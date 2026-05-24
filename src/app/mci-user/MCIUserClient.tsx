'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { ACTIVITY_TILES } from '@/types'
import type { Profile, ActivityLog, ContextCard, ActivityTileConfig } from '@/types'
import ActivityLogModal from '@/components/mci/ActivityLogModal'
import ContextCardDisplay from '@/components/mci/ContextCardDisplay'
import HouseholdCode from '@/components/mci/HouseholdCode'
import ReminderSettings from '@/components/mci/ReminderSettings'

interface Props {
  profile: Profile
  initialActivities: ActivityLog[]
  initialContextCard: ContextCard | null
  household: { join_code: string; name: string } | null
}

export default function MCIUserClient({ profile, initialActivities, initialContextCard, household }: Props) {
  const supabase = createClient()

  const [activities, setActivities] = useState<ActivityLog[]>(initialActivities)
  const [contextCard, setContextCard] = useState<ContextCard | null>(initialContextCard)
  const [selectedTile, setSelectedTile] = useState<ActivityTileConfig | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showHousehold, setShowHousehold] = useState(false)
  const [generatingCard, setGeneratingCard] = useState(false)

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Subscribe to realtime activity updates
  useEffect(() => {
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
  }, [profile.household_id])

  const handleActivityLogged = useCallback(async (activity: ActivityLog) => {
    setActivities(prev => [activity, ...prev])
    setSelectedTile(null)

    // Generate/refresh open context card after logging
    setGeneratingCard(true)
    try {
      const res = await fetch('/api/context-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_log_id: activity.id,
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
              setContextCard(null)
            }}
          />
        ) : generatingCard ? (
          <div className="card p-5 animate-pulse-soft">
            <div className="h-4 bg-cream-200 rounded-pill w-1/3 mb-3" />
            <div className="h-3 bg-cream-200 rounded-pill w-full mb-2" />
            <div className="h-3 bg-cream-200 rounded-pill w-4/5" />
          </div>
        ) : activities.length === 0 ? (
          <div className="card p-5 border border-cream-200 animate-fade-up">
            <p className="font-serif text-warm-700 text-base italic">
              "Tap a tile below to log your first activity of the day."
            </p>
            <p className="text-warm-300 text-xs mt-2">A summary card will appear here as your day builds.</p>
          </div>
        ) : null}

        {/* Activity Tiles Grid */}
        <div>
          <p className="text-warm-500 text-sm font-medium mb-3">What are you up to?</p>
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
            {/* Custom tile */}
            <button
              onClick={() => setSelectedTile({
                category: 'custom',
                icon: '✏️',
                label: 'Other',
                colorClass: 'tile-custom',
                suggestions: [],
              })}
              className="tile-custom border-2 rounded-card p-4 text-left
                          hover:shadow-float active:scale-[0.96] transition-all animate-fade-up delay-400"
            >
              <span className="text-2xl block mb-1.5">✏️</span>
              <span className="text-sm font-medium text-warm-700">Other</span>
            </button>
          </div>
        </div>

        {/* Today's Timeline */}
        {activities.length > 0 && (
          <div className="animate-fade-up">
            <p className="text-warm-500 text-sm font-medium mb-3">Today's timeline</p>
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
                        return (
                          <div key={a.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-cream-100">
                            <span className="text-xl">{tileConfig?.icon ?? '📌'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-warm-800 truncate">{a.label}</p>
                              {a.note && <p className="text-xs text-warm-400 truncate">{a.note}</p>}
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
          profile={profile}
          onLogged={handleActivityLogged}
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
