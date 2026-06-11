'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { trackClientEvent } from '@/lib/client-analytics'
import { getLocalDateKey } from '@/lib/dates'
import { suppressNearbyDuplicateActivities } from '@/lib/activity-display'
import { getPhoneSaveErrorMessage, normalizePhone } from '@/lib/sms'
import { ACTIVITY_TILES } from '@/types'
import type { Profile, ActivityLog, PlannedActivity } from '@/types'

interface Props {
  careProfile: Profile
  mciProfile: Profile | null
  initialActivities: ActivityLog[]
  initialPlannedActivities: PlannedActivity[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COMPLETED_BATCH_SIZE = 20

type ConfirmedEntry = {
  id: string
  category: ActivityLog['category']
  label: string
  detail: string | null
  occurredAt: string | null
  dayKey: string
  timeLabel: string
}

function getActivityDetail(category: ActivityLog['category'], label: string, note?: string | null) {
  const tile = ACTIVITY_TILES.find(t => t.category === category)
  return note || (tile && label !== tile.label ? label : null)
}

function formatConfirmedTime(value: string | null | undefined, timeZone?: string | null) {
  if (!value) return 'Done'
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timeZone ?? undefined,
  })
}

function getConfirmedEntries(
  activities: ActivityLog[],
  plannedActivities: PlannedActivity[],
  timeZone?: string | null
) {
  const activityLogIds = new Set(activities.map(a => a.id))
  const activityEntries: ConfirmedEntry[] = activities.map(a => ({
    id: `log-${a.id}`,
    category: a.category,
    label: a.label,
    detail: getActivityDetail(a.category, a.label, a.note),
    occurredAt: a.occurred_at,
    dayKey: getLocalDateKey(new Date(a.occurred_at), timeZone),
    timeLabel: formatConfirmedTime(a.occurred_at, timeZone),
  }))
  const plannedEntries: ConfirmedEntry[] = plannedActivities
    .filter(item => item.status === 'confirmed')
    .filter(item => !item.confirmed_activity_log_id || !activityLogIds.has(item.confirmed_activity_log_id))
    .map(item => {
      const occurredAt = item.confirmed_at ?? item.updated_at ?? item.created_at
      return {
        id: `plan-${item.id}`,
        category: item.category,
        label: item.label,
        detail: getActivityDetail(item.category, item.label, item.note),
        occurredAt,
        dayKey: item.planned_for,
        timeLabel: formatConfirmedTime(occurredAt, timeZone),
      }
    })

  return [...activityEntries, ...plannedEntries].sort((a, b) => {
    const aTime = a.occurredAt ? new Date(a.occurredAt).getTime() : 0
    const bTime = b.occurredAt ? new Date(b.occurredAt).getTime() : 0
    return aTime - bTime
  })
}

function groupConfirmedByDay(entries: ConfirmedEntry[]) {
  const groups: Record<string, ConfirmedEntry[]> = {}
  for (const entry of entries) {
    if (!groups[entry.dayKey]) groups[entry.dayKey] = []
    groups[entry.dayKey].push(entry)
  }
  return groups
}

function getCategoryBreakdown(entries: Array<{ category: ActivityLog['category'] }>) {
  const counts: Record<string, number> = {}
  for (const entry of entries) {
    counts[entry.category] = (counts[entry.category] ?? 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
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

const SHOW_SMS_TEST_TOOLS = process.env.NEXT_PUBLIC_SHOW_SMS_TEST_TOOLS === 'true'

export default function CarePartnerClient({ careProfile, mciProfile, initialActivities, initialPlannedActivities }: Props) {
  const supabase = createClient()
  const [activities] = useState<ActivityLog[]>(initialActivities)
  const [plannedActivities] = useState<PlannedActivity[]>(initialPlannedActivities)
  const [visibleCompletedCount, setVisibleCompletedCount] = useState(3)
  const [weeklyOverviewOpen, setWeeklyOverviewOpen] = useState(false)
  const [skippedActivitiesOpen, setSkippedActivitiesOpen] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [smsTestState, setSmsTestState] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})
  const [smsTestError, setSmsTestError] = useState<string | null>(null)
  const [carePhone, setCarePhone] = useState(careProfile.phone_e164 ?? '')
  const [careSmsConsent, setCareSmsConsent] = useState(Boolean(careProfile.phone_e164))
  const [carePhoneSaving, setCarePhoneSaving] = useState(false)
  const [carePhoneSaved, setCarePhoneSaved] = useState(false)
  const [carePhoneError, setCarePhoneError] = useState<string | null>(null)

  const displayActivities = suppressNearbyDuplicateActivities(activities, plannedActivities)
  const confirmedEntries = getConfirmedEntries(displayActivities, plannedActivities, careProfile.timezone)
  const confirmedByDay = groupConfirmedByDay(confirmedEntries)

  useEffect(() => {
    trackClientEvent('care_partner_dashboard_viewed', {
      activity_count: initialActivities.length,
      planned_activity_count: initialPlannedActivities.length,
      has_mci_profile: Boolean(mciProfile),
    })
  }, [initialActivities.length, initialPlannedActivities.length, mciProfile])

  // Build last 7 days for the week strip
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return {
      key: getLocalDateKey(d, careProfile.timezone),
      label: DAYS[d.getDay()],
      dayNum: d.getDate(),
      count: confirmedByDay[getLocalDateKey(d, careProfile.timezone)]?.length ?? 0,
      isToday: getLocalDateKey(d, careProfile.timezone) === getLocalDateKey(new Date(), careProfile.timezone),
    }
  })

  // Today's stats
  const todayKey = getLocalDateKey(new Date(), careProfile.timezone)
  const todayConfirmedEntries = [...(confirmedByDay[todayKey] ?? [])].reverse()
  const categoryBreakdown = getCategoryBreakdown(todayConfirmedEntries)
    .filter(([category]) => category !== 'custom')
  const sortedPlannedActivities = [...plannedActivities].sort((a, b) => {
    const periodDiff = (PERIOD_ORDER[a.expected_period] ?? 9) - (PERIOD_ORDER[b.expected_period] ?? 9)
    if (periodDiff !== 0) return periodDiff
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
  const waitingActivities = sortedPlannedActivities.filter(
    item => item.status === 'planned' || item.status === 'not_now',
  )
  const skippedActivities = sortedPlannedActivities.filter(item => item.status === 'skipped')
  const openPlanCount = waitingActivities.length
  const visibleCompletedEntries = todayConfirmedEntries.slice(0, visibleCompletedCount)

  async function sendTestSummary() {
    if (!careProfile.phone_e164 && !carePhone.trim()) return
    setTestSending(true)
    try {
      await fetch('/api/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: careProfile.household_id }),
      })
      setTestSent(true)
      trackClientEvent('daily_summary_test_clicked', {
        has_phone: Boolean(careProfile.phone_e164),
      })
      setTimeout(() => setTestSent(false), 4000)
    } catch {}
    setTestSending(false)
  }

  async function sendSmsTest(action: string) {
    setSmsTestError(null)
    setSmsTestState(current => ({ ...current, [action]: 'sending' }))
    try {
      const response = await fetch('/api/sms/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSmsTestState(current => ({ ...current, [action]: 'error' }))
        setSmsTestError(result.error || 'SMS test failed.')
        return
      }

      setSmsTestState(current => ({ ...current, [action]: 'sent' }))
      setTimeout(() => {
        setSmsTestState(current => ({ ...current, [action]: 'idle' }))
      }, 4000)
    } catch {
      setSmsTestState(current => ({ ...current, [action]: 'error' }))
      setSmsTestError('SMS test failed.')
    }
  }

  async function saveCarePhone() {
    const phoneValue = carePhone.trim()
    const phoneE164 = phoneValue ? normalizePhone(phoneValue) : null

    if (phoneE164 && !careSmsConsent) {
      setCarePhoneError('Please check SMS consent to receive care partner texts, or leave the phone number blank.')
      return
    }

    setCarePhoneSaving(true)
    setCarePhoneError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ phone_e164: phoneE164 })
      .eq('id', careProfile.id)
    setCarePhoneSaving(false)
    if (error) {
      setCarePhoneError(getPhoneSaveErrorMessage(error))
      return
    }
    setCarePhone(phoneE164 ?? '')
    setCarePhoneSaved(true)
    setTimeout(() => setCarePhoneSaved(false), 2500)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

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
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              className="w-10 h-10 rounded-full bg-cream-100 text-lg flex items-center justify-center
                         hover:bg-cream-200 active:scale-95 transition-all"
            >
              ⚙
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
                {todayConfirmedEntries.length} completed, {openPlanCount} waiting
              </p>
            </div>
            <div className={`px-3 py-1 rounded-pill text-xs font-medium ${
              todayConfirmedEntries.length > 0 ? 'bg-sage-100 text-sage-600' : 'bg-cream-200 text-warm-400'
            }`}>
              {todayConfirmedEntries.length > 0 ? '● Active' : '○ Quiet'}
            </div>
          </div>
        ) : (
          <div className="card p-5 border-2 border-dashed border-cream-300 animate-fade-up">
            <p className="text-warm-500 text-sm text-center">
              Household setup needs attention.
            </p>
            <p className="mt-2 text-xs leading-5 text-warm-400 text-center">
              The care partner account is signed in, but the linked MCI member is not showing in this household.
            </p>
          </div>
        )}

        {/* Waiting now */}
        <div className="animate-fade-up delay-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-warm-500 text-sm font-medium">Waiting now</p>
            {openPlanCount > 0 && (
              <span className="text-xs text-warm-400">{openPlanCount} waiting</span>
            )}
          </div>
          {waitingActivities.length === 0 ? (
            <div className="card p-5 text-center">
              <p className="text-warm-400 text-sm">Nothing is waiting right now.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {waitingActivities.map(item => {
                const tile = ACTIVITY_TILES.find(t => t.category === item.category)
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
                              : 'bg-terracotta-50 text-terracotta-600'
                          }`}>
                            {item.status === 'not_now' ? 'Later' : 'Waiting'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {skippedActivities.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setSkippedActivitiesOpen(current => !current)}
                className="w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 flex items-center justify-between gap-3 text-left"
                aria-expanded={skippedActivitiesOpen}
                aria-controls="skipped-activities"
              >
                <span className="text-sm font-medium text-warm-600">
                  {skippedActivities.length} skipped today
                </span>
                <span className="text-warm-400" aria-hidden="true">{skippedActivitiesOpen ? '⌃' : '⌄'}</span>
              </button>
              {skippedActivitiesOpen && (
                <div id="skipped-activities" className="mt-2 space-y-2">
                  {skippedActivities.map(item => (
                    <div key={item.id} className="rounded-xl border border-cream-200 bg-cream-100 px-4 py-3">
                      <p className="text-sm font-medium text-warm-600 whitespace-normal break-words">
                        {item.note?.trim() || item.label}
                      </p>
                      <p className="text-xs text-warm-400 mt-1">
                        {PERIOD_LABELS[item.expected_period] ?? 'Anytime'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Completed today */}
        <div className="animate-fade-up delay-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-warm-500 text-sm font-medium">Completed today</p>
            {todayConfirmedEntries.length > 0 && (
              <span className="text-xs text-sage-600">{todayConfirmedEntries.length} completed</span>
            )}
          </div>
          {todayConfirmedEntries.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-warm-400 text-sm">No activities completed yet today.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleCompletedEntries.map(entry => {
                const tile = ACTIVITY_TILES.find(t => t.category === entry.category)
                const taskName = entry.detail?.trim() || entry.label
                const categoryName = tile?.label ?? entry.label
                return (
                  <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-sage-200 bg-sage-50 px-4 py-3">
                    <span
                      className="w-8 h-8 shrink-0 rounded-full bg-sage-100 border border-sage-200 flex items-center justify-center text-sage-600 font-semibold"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium leading-5 text-warm-700 whitespace-normal break-words">{taskName}</p>
                      <p className="text-xs leading-5 text-warm-400 mt-1">
                        {tile?.icon ?? '📌'} {entry.category !== 'custom' && `${categoryName}, `}{entry.timeLabel}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {todayConfirmedEntries.length > 3 && (
            <div className="mt-3 space-y-2">
              {visibleCompletedCount < todayConfirmedEntries.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleCompletedCount(current =>
                    current === 3
                      ? Math.min(COMPLETED_BATCH_SIZE, todayConfirmedEntries.length)
                      : Math.min(current + COMPLETED_BATCH_SIZE, todayConfirmedEntries.length)
                  )}
                  className="w-full min-h-12 rounded-xl border border-sage-200 bg-sage-50 px-4 text-base font-medium text-warm-700 active:scale-[0.99] transition-all"
                  aria-expanded={visibleCompletedCount > 3}
                >
                  {visibleCompletedCount === 3
                    ? `Show all ${todayConfirmedEntries.length} completed`
                    : `Show ${Math.min(COMPLETED_BATCH_SIZE, todayConfirmedEntries.length - visibleCompletedCount)} more completed`}
                </button>
              ) : null}
              {visibleCompletedCount > 3 && (
                <button
                  type="button"
                  onClick={() => setVisibleCompletedCount(3)}
                  className="w-full min-h-11 rounded-xl px-4 text-sm font-medium text-warm-500 underline decoration-warm-200 underline-offset-4"
                >
                  Show fewer completed
                </button>
              )}
            </div>
          )}
        </div>

        {/* Weekly overview */}
        <div className="animate-fade-up delay-300">
          <button
            type="button"
            onClick={() => setWeeklyOverviewOpen(current => !current)}
            className="w-full min-h-14 rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 flex items-center justify-between gap-4 text-left active:scale-[0.99] transition-all"
            aria-expanded={weeklyOverviewOpen}
            aria-controls="weekly-overview"
          >
            <span>
              <span className="block text-base font-medium text-warm-700">Weekly overview</span>
              <span className="block text-xs text-warm-400 mt-0.5">Activity types and the last 7 days</span>
            </span>
            <span className="text-xl text-warm-400" aria-hidden="true">{weeklyOverviewOpen ? '⌃' : '⌄'}</span>
          </button>

          {weeklyOverviewOpen && (
            <div id="weekly-overview" className="mt-3 space-y-5 rounded-xl border border-cream-200 bg-white p-4">
              {categoryBreakdown.length > 0 && (
                <div>
                  <p className="text-warm-500 text-sm font-medium mb-3">Completed activity types today</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {categoryBreakdown.slice(0, 6).map(([cat, count]) => {
                      const tile = ACTIVITY_TILES.find(t => t.category === cat)
                      return (
                        <div key={cat} className={`${tile?.colorClass ?? 'tile-custom'} border rounded-xl px-3 py-3 text-center`}>
                          <div className="text-xl mb-1" aria-hidden="true">{tile?.icon ?? '📌'}</div>
                          <div className="text-xs font-medium text-warm-700">{tile?.label ?? cat}</div>
                          <div className="text-lg font-semibold text-warm-900">{count}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <p className="text-warm-500 text-sm font-medium mb-3">Completed activity this week</p>
                <div className="grid grid-cols-7 gap-1" aria-label="Completed activities during the last 7 days">
                  {weekDays.map(day => (
                    <div
                      key={day.key}
                      className={`min-w-0 flex flex-col items-center py-3 px-0.5 rounded-xl ${
                        day.isToday ? 'bg-cream-200 text-warm-900' : 'bg-cream-100 text-warm-500'
                      }`}
                    >
                      <span className="text-[11px] font-medium">{day.label}</span>
                      <span className="text-sm font-semibold mt-0.5">{day.dayNum}</span>
                      <span className="mt-1 text-xs rounded-pill bg-warm-200 text-warm-600 px-1.5 font-medium">
                        {day.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}>
          <div className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg mx-auto bg-cream-50 rounded-t-3xl pt-2 pb-10 px-6 shadow-float animate-fade-up max-h-[92svh] overflow-y-auto">
            <div className="w-10 h-1 bg-warm-300 rounded-pill mx-auto mb-6" />

            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-xl font-semibold text-warm-900">Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-warm-400 hover:text-warm-700 text-2xl">×</button>
            </div>

            <div className="space-y-6">
              <div>
                <p className="font-medium text-warm-900 text-sm">Care partner phone</p>
                <p className="text-warm-400 text-xs mt-0.5">
                  Used for daily summaries and no-response alerts.
                </p>
                <input
                  type="tel"
                  value={carePhone}
                  onChange={e => {
                    setCarePhone(e.target.value)
                    if (!e.target.value.trim()) setCareSmsConsent(false)
                  }}
                  className="mt-3 w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900
                             focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100"
                  placeholder="(555) 555-0100"
                  autoComplete="tel"
                  inputMode="tel"
                />
                <label className="mt-3 flex gap-3 rounded-xl border border-cream-300 bg-white/70 p-3 text-xs leading-5 text-warm-600">
                  <input
                    type="checkbox"
                    checked={careSmsConsent}
                    required={Boolean(carePhone.trim())}
                    onChange={e => setCareSmsConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-warm-500 text-warm-700 focus:ring-warm-500"
                  />
                  <span>
                    Optional SMS opt-in: I agree to receive Context care partner texts. Message frequency varies.
                    Message and data rates may apply. Reply HELP for help or STOP to opt out.
                  </span>
                </label>
                {carePhoneError && (
                  <p className="mt-3 text-xs text-terracotta-500 bg-terracotta-50 rounded-lg px-3 py-2">{carePhoneError}</p>
                )}
                <button
                  onClick={saveCarePhone}
                  disabled={carePhoneSaving}
                  className="mt-3 w-full py-2.5 rounded-xl border-2 border-warm-300 text-warm-700 text-sm font-medium
                             hover:bg-cream-100 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {carePhoneSaving ? 'Saving...' : carePhoneSaved ? 'Saved!' : 'Save care partner phone'}
                </button>
              </div>

              <div className="border-t border-cream-200 pt-5 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📱</span>
                  <div>
                    <p className="font-medium text-warm-900 text-sm">Daily SMS summary</p>
                    <p className="text-warm-400 text-xs mt-0.5">
                      Sent to {careProfile.phone_e164 ?? (carePhone || 'no phone on file')} each evening.
                    </p>
                  </div>
                </div>
                {careProfile.phone_e164 || carePhone ? (
                  <button
                    onClick={sendTestSummary}
                    disabled={testSending}
                    className="w-full py-2.5 rounded-xl border-2 border-warm-300 text-warm-700 text-sm font-medium
                               hover:bg-cream-100 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {testSending ? 'Sending…' : testSent ? 'Sent! Check your phone ✓' : 'Send test summary now'}
                  </button>
                ) : (
                  <p className="text-xs text-terracotta-500">Add a phone number to enable SMS.</p>
                )}
              </div>

              {SHOW_SMS_TEST_TOOLS && (
                <div className="border-t border-cream-200 pt-5 space-y-3">
                  <div>
                    <p className="font-medium text-warm-900 text-sm">MVP SMS flow tests</p>
                    <p className="text-warm-400 text-xs mt-0.5">
                      Temporary tools for testing the morning plan, follow-up, pending reminders, and care partner alerts.
                    </p>
                  </div>
                  {[
                    ['morning_prompt', 'Send morning plan prompt'],
                    ['morning_followup', 'Send no-response follow-up'],
                    ['pending_reminder', 'Send pending plan reminder'],
                    ['care_partner_no_response', 'Send care partner no-response alert'],
                  ].map(([action, label]) => {
                    const state = smsTestState[action] ?? 'idle'
                    return (
                      <button
                        key={action}
                        onClick={() => sendSmsTest(action)}
                        disabled={state === 'sending'}
                        className="w-full py-2.5 rounded-xl border-2 border-cream-300 text-warm-700 text-sm font-medium
                                   hover:bg-cream-100 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {state === 'sending' ? 'Sending...' : state === 'sent' ? 'Sent! Check phone' : state === 'error' ? 'Try again' : label}
                      </button>
                    )
                  })}
                  {smsTestError && (
                    <p className="text-xs text-terracotta-500 bg-terracotta-50 rounded-lg px-3 py-2">{smsTestError}</p>
                  )}
                </div>
              )}

              <div className="border-t border-cream-200 pt-4">
                <button
                  onClick={handleSignOut}
                  className="w-full py-3 text-warm-400 text-sm hover:text-terracotta-500 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
