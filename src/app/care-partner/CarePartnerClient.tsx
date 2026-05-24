'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getLocalDateKey } from '@/lib/dates'
import { ACTIVITY_TILES } from '@/types'
import type { Profile, ActivityLog } from '@/types'

interface Props {
  careProfile: Profile
  mciProfile: Profile | null
  initialActivities: ActivityLog[]
  household: { join_code: string; name: string } | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function groupByDay(activities: ActivityLog[], timeZone?: string | null) {
  const groups: Record<string, ActivityLog[]> = {}
  for (const a of activities) {
    const key = getLocalDateKey(new Date(a.occurred_at), timeZone)
    if (!groups[key]) groups[key] = []
    groups[key].push(a)
  }
  return groups
}

function getCategoryBreakdown(activities: ActivityLog[]) {
  const counts: Record<string, number> = {}
  for (const a of activities) {
    counts[a.category] = (counts[a.category] ?? 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

export default function CarePartnerClient({ careProfile, mciProfile, initialActivities, household }: Props) {
  const supabase = createClient()
  const [activities] = useState<ActivityLog[]>(initialActivities)
  const [selectedDay, setSelectedDay] = useState<string>(getLocalDateKey(new Date(), careProfile.timezone))
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)

  const byDay = groupByDay(activities, careProfile.timezone)

  // Build last 7 days for the week strip
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return {
      key: getLocalDateKey(d, careProfile.timezone),
      label: DAYS[d.getDay()],
      dayNum: d.getDate(),
      count: byDay[getLocalDateKey(d, careProfile.timezone)]?.length ?? 0,
      isToday: getLocalDateKey(d, careProfile.timezone) === getLocalDateKey(new Date(), careProfile.timezone),
    }
  })

  const selectedActivities = byDay[selectedDay] ?? []

  // Today's stats
  const todayKey = getLocalDateKey(new Date(), careProfile.timezone)
  const todayActivities = byDay[todayKey] ?? []
  const categoryBreakdown = getCategoryBreakdown(todayActivities)

  async function sendTestSummary() {
    if (!careProfile.phone_e164) return
    setTestSending(true)
    try {
      await fetch('/api/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: careProfile.household_id }),
      })
      setTestSent(true)
      setTimeout(() => setTestSent(false), 4000)
    } catch {}
    setTestSending(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const memberName = mciProfile?.display_name ?? 'Your household member'
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-svh bg-cream-50 pb-10 safe-bottom">
      {/* Header */}
      <div className="bg-sage-50 border-b border-sage-100 safe-top">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-warm-400 text-xs font-medium uppercase tracking-wide">Care Partner View</p>
            <h1 className="font-serif text-lg font-semibold text-warm-900">
              {greeting}, {careProfile.display_name}
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSignOut}
              className="text-sm text-warm-400 hover:text-warm-700 px-3 py-1.5 rounded-lg hover:bg-cream-100 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 space-y-6 pt-5">

        {/* Member info card */}
        {mciProfile ? (
          <div className="card p-5 flex items-center gap-4 animate-fade-up">
            <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center text-2xl flex-shrink-0">
              🧑‍🦳
            </div>
            <div className="flex-1">
              <p className="font-medium text-warm-900">{mciProfile.display_name}</p>
              <p className="text-sm text-warm-400">
                {todayActivities.length} {todayActivities.length === 1 ? 'activity' : 'activities'} logged today
              </p>
            </div>
            <div className={`px-3 py-1 rounded-pill text-xs font-medium ${
              todayActivities.length > 0 ? 'bg-sage-100 text-sage-600' : 'bg-cream-200 text-warm-400'
            }`}>
              {todayActivities.length > 0 ? '● Active' : '○ Quiet'}
            </div>
          </div>
        ) : (
          <div className="card p-5 border-2 border-dashed border-cream-300 animate-fade-up">
            <p className="text-warm-500 text-sm text-center">
              No household member linked yet. Share join code: <strong className="font-mono">{household?.join_code}</strong>
            </p>
          </div>
        )}

        {/* Today's activity breakdown */}
        {todayActivities.length > 0 && (
          <div className="animate-fade-up delay-100">
            <p className="text-warm-500 text-sm font-medium mb-3">Today's activity types</p>
            <div className="grid grid-cols-3 gap-2">
              {categoryBreakdown.slice(0, 6).map(([cat, count]) => {
                const tile = ACTIVITY_TILES.find(t => t.category === cat)
                return (
                  <div key={cat} className={`${tile?.colorClass ?? 'tile-custom'} border-2 rounded-xl px-3 py-3 text-center`}>
                    <div className="text-2xl mb-1">{tile?.icon ?? '📌'}</div>
                    <div className="text-xs font-medium text-warm-700">{tile?.label ?? cat}</div>
                    <div className="text-lg font-semibold text-warm-900">{count}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 7-day week strip */}
        <div className="animate-fade-up delay-200">
          <p className="text-warm-500 text-sm font-medium mb-3">Activity this week</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {weekDays.map(day => (
              <button
                key={day.key}
                onClick={() => setSelectedDay(day.key)}
                className={`flex-1 min-w-[44px] flex flex-col items-center py-3 px-1 rounded-xl transition-all ${
                  selectedDay === day.key
                    ? 'bg-warm-700 text-cream-100 shadow-card'
                    : day.isToday
                    ? 'bg-cream-200 text-warm-900'
                    : 'bg-cream-100 text-warm-500 hover:bg-cream-200'
                }`}
              >
                <span className="text-xs font-medium">{day.label}</span>
                <span className="text-sm font-semibold mt-0.5">{day.dayNum}</span>
                {day.count > 0 && (
                  <span className={`mt-1 text-xs rounded-pill px-1.5 font-medium ${
                    selectedDay === day.key ? 'bg-white/20 text-cream-100' : 'bg-warm-200 text-warm-600'
                  }`}>
                    {day.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Selected day activity list */}
        <div className="animate-fade-up delay-300">
          <p className="text-warm-500 text-sm font-medium mb-3">
            {selectedDay === getLocalDateKey(new Date(), careProfile.timezone) ? "Today's log" : `Log for ${new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`}
          </p>
          {selectedActivities.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-warm-300 text-sm">No activities logged this day.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...selectedActivities].reverse().map(a => {
                const tile = ACTIVITY_TILES.find(t => t.category === a.category)
                const timeStr = new Date(a.occurred_at).toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit', hour12: true,
                })
                return (
                  <div key={a.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-cream-100">
                    <span className="text-xl">{tile?.icon ?? '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-warm-800 truncate">{a.label}</p>
                      {a.note && <p className="text-xs text-warm-400 truncate">{a.note}</p>}
                    </div>
                    <span className="text-xs text-warm-300 whitespace-nowrap">{timeStr}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* SMS Summary test */}
        <div className="card p-5 space-y-3 animate-fade-up delay-400">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📱</span>
            <div>
              <p className="font-medium text-warm-900 text-sm">Daily SMS summary</p>
              <p className="text-warm-400 text-xs mt-0.5">
                Sent to {careProfile.phone_e164 ?? 'no phone on file'} each evening.
              </p>
            </div>
          </div>
          {careProfile.phone_e164 ? (
            <button
              onClick={sendTestSummary}
              disabled={testSending}
              className="w-full py-2.5 rounded-xl border-2 border-warm-300 text-warm-700 text-sm font-medium
                         hover:bg-cream-100 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {testSending ? 'Sending…' : testSent ? 'Sent! Check your phone ✓' : 'Send test summary now'}
            </button>
          ) : (
            <p className="text-xs text-terracotta-500">Add a phone number in settings to enable SMS.</p>
          )}
        </div>
      </div>
    </div>
  )
}
