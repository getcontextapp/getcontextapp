'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { trackClientEvent } from '@/lib/client-analytics'
import { getLocalDateKey } from '@/lib/dates'
import { suppressNearbyDuplicateActivities } from '@/lib/activity-display'
import { getPhoneSaveErrorMessage, normalizePhone } from '@/lib/sms'
import { formatTaskTiming, REPEAT_LABELS } from '@/lib/task-scheduling'
import CalendarCard from '@/components/calendar/CalendarCard'
import EditTaskSheet from '@/components/mci/EditTaskSheet'
import { isPlanForDisplayedDate } from '@/lib/calendar-plan'
import ReadOnlyDailyReflection from '@/components/mci/ReadOnlyDailyReflection'
import NotificationUpdates from '@/components/notifications/NotificationUpdates'
import { ACTIVITY_TILES } from '@/types'
import type { Profile, ActivityLog, PlannedActivity, Reflection } from '@/types'
import type { CalendarDashboardData } from '@/lib/calendar-sync'

interface Props {
  careProfile: Profile
  mciProfile: Profile | null
  initialActivities: ActivityLog[]
  initialPlannedActivities: PlannedActivity[]
  initialReflection: Reflection | null
  calendar: CalendarDashboardData
  dashboardSource: 'sms_link' | 'direct' | 'home_screen'
}

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

const PERIOD_ORDER: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  anytime: 3,
}

const SHOW_SMS_TEST_TOOLS = process.env.NEXT_PUBLIC_SHOW_SMS_TEST_TOOLS === 'true'

export default function CarePartnerClient({ careProfile, mciProfile, initialActivities, initialPlannedActivities, initialReflection, calendar, dashboardSource }: Props) {
  const supabase = createClient()
  const [activities] = useState<ActivityLog[]>(initialActivities)
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>(initialPlannedActivities)
  const [calendarConnection, setCalendarConnection] = useState(calendar.connection)
  const [calendarEvents, setCalendarEvents] = useState(calendar.events)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [smsTestState, setSmsTestState] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})
  const [smsTestError, setSmsTestError] = useState<string | null>(null)
  const [careFirstName, setCareFirstName] = useState(careProfile.display_name)
  const [carePhone, setCarePhone] = useState(careProfile.phone_e164 ?? '')
  const [careSmsConsent, setCareSmsConsent] = useState(Boolean(careProfile.phone_e164))
  const [carePhoneSaving, setCarePhoneSaving] = useState(false)
  const [carePhoneSaved, setCarePhoneSaved] = useState(false)
  const [carePhoneError, setCarePhoneError] = useState<string | null>(null)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [editCandidate, setEditCandidate] = useState<PlannedActivity | null>(null)

  const displayActivities = suppressNearbyDuplicateActivities(activities, plannedActivities)
  const confirmedEntries = getConfirmedEntries(displayActivities, plannedActivities, careProfile.timezone)

  useEffect(() => {
    trackClientEvent('care_partner_dashboard_viewed', {
      activity_count: initialActivities.length,
      planned_activity_count: initialPlannedActivities.length,
      has_mci_profile: Boolean(mciProfile),
      source: dashboardSource,
    })
  }, [initialActivities.length, initialPlannedActivities.length, mciProfile, dashboardSource])

  const todayKey = getLocalDateKey(new Date(), careProfile.timezone)
  const todayConfirmedEntries = confirmedEntries
    .filter(entry => entry.dayKey === todayKey)
    .reverse()
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
  const waitingActivities = sortedPlannedActivities.filter(
    item => item.status === 'planned' || item.status === 'not_now',
  )
  const visibleCompletedEntries = todayConfirmedEntries
  const canManageSchedule = Boolean(mciProfile?.care_partner_calendar_management)
  const todayCalendarEvents = calendarEvents
    .filter(event => !event.hidden_at && getLocalDateKey(new Date(event.starts_at), mciProfile?.timezone) === todayKey)
    .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at))

  async function addTask() {
    if (!newTaskName.trim()) return
    setTaskSaving(true)
    setTaskError(null)
    const response = await fetch('/api/planned-activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'custom', label: newTaskName.trim(), note: newTaskName.trim(),
        expected_period: 'anytime', expected_time: null, planned_for: todayKey, repeat_rule: 'none',
      }),
    })
    const result = await response.json().catch(() => ({}))
    setTaskSaving(false)
    if (!response.ok) {
      setTaskError(result.error || 'Could not add this task.')
      return
    }
    setPlannedActivities(current => [...current, result])
    setNewTaskName('')
    setAddingTask(false)
  }

  async function deleteTask(task: PlannedActivity, action: 'delete' | 'remove_today' | 'stop_repeating' = 'delete') {
    const response = await fetch('/api/planned-activities', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, action }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setTaskError(result.error || 'Could not change this task.')
      return
    }
    const removed = new Set(result.deleted_planned_activity_ids ?? [task.id])
    setPlannedActivities(current => current.filter(item => !removed.has(item.id)))
    setEditCandidate(null)
  }

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

  async function saveCareProfile() {
    const displayName = careFirstName.trim().replace(/\s+/g, ' ')
    const phoneValue = carePhone.trim()
    const phoneE164 = phoneValue ? normalizePhone(phoneValue) : null

    if (!displayName) {
      setCarePhoneError('Please enter your first name.')
      return
    }

    if (phoneE164 && !careSmsConsent) {
      setCarePhoneError('Please check SMS consent to receive care partner texts, or leave the phone number blank.')
      return
    }

    setCarePhoneSaving(true)
    setCarePhoneError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName, phone_e164: phoneE164 })
      .eq('id', careProfile.id)
    setCarePhoneSaving(false)
    if (error) {
      setCarePhoneError(getPhoneSaveErrorMessage(error))
      return
    }
    const nameChanged = displayName !== careProfile.display_name
    setCareFirstName(displayName)
    setCarePhone(phoneE164 ?? '')
    setCarePhoneSaved(true)
    if (nameChanged) {
      setTimeout(() => window.location.reload(), 500)
      return
    }
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
            <NotificationUpdates />
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
          <div className="card p-5 animate-fade-up">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center text-2xl flex-shrink-0">
                🧑‍🦳
              </div>
              <div className="flex-1">
                <p className="font-medium text-warm-900">{mciProfile.display_name}</p>
                <p className="text-sm text-warm-400">A calm view of today</p>
              </div>
              <div className="px-3 py-1 rounded-pill text-xs font-medium bg-sage-100 text-sage-600">
                ○ Quiet
              </div>
            </div>
            <p className="mt-4 rounded-2xl bg-sage-50 px-4 py-3 text-base font-medium leading-6 text-sage-600">
              {todayConfirmedEntries.length > 0
                ? `${mciProfile.display_name} has activity noted from earlier today. No follow-up is needed right now.`
                : `${mciProfile.display_name} has a quiet day so far. No follow-up is needed right now.`}
            </p>
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

        {mciProfile && canManageSchedule && (
          <div className="animate-fade-up">
            {!addingTask ? (
              <button type="button" onClick={() => setAddingTask(true)}
                className="w-full min-h-14 rounded-pill border-2 border-cream-300 bg-white px-5 py-3 shadow-card flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-sage-300">
                <span className="text-lg" aria-hidden="true">＋</span>
                <span className="flex-1 text-base font-medium text-warm-600">Add a task for {mciProfile.display_name.split(/\s+/)[0]}...</span>
                <span className="w-9 h-9 rounded-full bg-warm-700 text-cream-50 flex items-center justify-center" aria-hidden="true">→</span>
              </button>
            ) : (
              <div className="rounded-[20px] border-2 border-cream-300 bg-white p-4 shadow-card">
                <label htmlFor="cp-new-task" className="text-sm font-semibold text-warm-700">What should be added today?</label>
                <input id="cp-new-task" autoFocus value={newTaskName} onChange={event => setNewTaskName(event.target.value)} maxLength={160}
                  className="mt-2 min-h-12 w-full rounded-xl border border-cream-300 px-4 text-base text-warm-900" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setAddingTask(false); setNewTaskName(''); setTaskError(null) }} className="min-h-12 rounded-xl border border-cream-300 text-warm-600">Cancel</button>
                  <button type="button" onClick={addTask} disabled={taskSaving || !newTaskName.trim()} className="min-h-12 rounded-xl bg-warm-700 text-cream-50 disabled:opacity-50">{taskSaving ? 'Adding...' : 'Add task'}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {mciProfile && (
          <div className="animate-fade-up delay-100 rounded-[20px] border-2 border-cream-300 bg-white p-4 shadow-card">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3">
              <h2 className="font-serif text-2xl font-semibold text-warm-900">Today</h2>
              {waitingActivities.length > 0 && <span className="text-xs text-warm-400">{waitingActivities.length} waiting</span>}
            </div>
            {todayCalendarEvents.length > 0 && (
              <div className="divide-y divide-cream-200">
                {todayCalendarEvents.map(event => (
                  <div key={event.id} className="flex items-start gap-3 py-4">
                    <p className="w-[70px] shrink-0 text-sm font-semibold text-warm-500">{event.all_day ? 'All day' : new Date(event.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: mciProfile.timezone })}</p>
                    <span className="text-lg" aria-hidden="true">📅</span>
                    <div className="min-w-0 flex-1"><p className="break-words text-base font-semibold text-warm-900">{event.title}</p><p className="mt-1 text-xs text-warm-400">Google Calendar{event.location ? ` · ${event.location}` : ''}</p></div>
                  </div>
                ))}
              </div>
            )}
            {waitingActivities.length === 0 && todayCalendarEvents.length === 0 ? (
              <p className="py-5 text-center text-sm text-warm-400">Nothing planned yet.</p>
            ) : (
              <div className={`space-y-2 ${todayCalendarEvents.length ? 'border-t border-cream-200 pt-3' : 'pt-3'}`}>
                {waitingActivities.map(item => {
                  const tile = ACTIVITY_TILES.find(t => t.category === item.category)
                  return (
                    <div key={item.id} className="rounded-xl border border-cream-100 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{tile?.icon ?? '📌'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-base font-semibold text-warm-900">{item.note?.trim() || item.label}</p>
                          <p className="mt-1 text-xs text-warm-400">Context · {formatTaskTiming(item.expected_time, item.expected_period)}{item.repeat_rule !== 'none' ? ` · ${REPEAT_LABELS[item.repeat_rule]}` : ''}</p>
                        </div>
                        <span className="rounded-pill bg-cream-200 px-2 py-0.5 text-[11px] text-warm-600">{item.status === 'not_now' ? 'Later' : 'Planned'}</span>
                      </div>
                      {canManageSchedule && <button type="button" onClick={() => setEditCandidate(item)} className="mt-3 min-h-11 w-full rounded-xl border border-cream-300 text-sm font-semibold text-warm-700">Edit task</button>}
                    </div>
                  )
                })}
              </div>
            )}
            <Link prefetch href="/care-partner/calendar" className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl border-2 border-cream-300 bg-white px-4 text-base font-semibold text-warm-800 active:scale-[0.99] transition-transform focus:outline-none focus:ring-4 focus:ring-sage-300/60">
              <span aria-hidden="true">📅</span>View full calendar
            </Link>
            {!canManageSchedule && <p className="mt-3 text-center text-xs leading-5 text-warm-400">View only. {mciProfile.display_name.split(/\s+/)[0]} controls editing access in Settings.</p>}
            {taskError && <p className="mt-3 rounded-xl bg-cream-100 px-4 py-3 text-sm text-terracotta-700">{taskError}</p>}
          </div>
        )}

        {mciProfile && !calendarConnection && (
          <CalendarCard role="care_partner" ownerProfileId={mciProfile.id} ownerName={mciProfile.display_name}
            enabled={calendar.enabled} canManage={canManageSchedule} connection={calendarConnection} events={calendarEvents} timeZone={mciProfile.timezone}
            onCalendarUpdated={nextCalendar => { setCalendarConnection(nextCalendar.connection); setCalendarEvents(nextCalendar.events) }}
            onPlannedActivityAdded={activity => { if (isPlanForDisplayedDate(activity.planned_for, todayKey)) setPlannedActivities(current => [...current, activity]) }} />
        )}

        {/* Completed today */}
        <div className="animate-fade-up delay-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-warm-900 text-lg font-semibold">Done earlier</p>
          </div>
          {todayConfirmedEntries.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-warm-400 text-sm">Nothing has been noted here yet today.</p>
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
        </div>

        {initialReflection && (
          <div className="animate-fade-up delay-300">
            <ReadOnlyDailyReflection reflection={initialReflection} ownerName={mciProfile?.display_name} />
          </div>
        )}

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
                <label htmlFor="care-first-name" className="font-medium text-warm-900 text-sm">First name</label>
                <p className="text-warm-400 text-xs mt-0.5">Used in greetings and care partner messages.</p>
                <input
                  id="care-first-name"
                  type="text"
                  required
                  maxLength={60}
                  value={careFirstName}
                  onChange={e => setCareFirstName(e.target.value)}
                  className="mt-3 w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900
                             focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100"
                  autoComplete="given-name"
                />
              </div>

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
                  onClick={saveCareProfile}
                  disabled={carePhoneSaving}
                  className="mt-3 w-full py-2.5 rounded-xl border-2 border-warm-300 text-warm-700 text-sm font-medium
                             hover:bg-cream-100 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {carePhoneSaving ? 'Saving...' : carePhoneSaved ? 'Saved!' : 'Save settings'}
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

      {editCandidate && (
        <EditTaskSheet
          task={editCandidate}
          onSaved={(updated, removedTaskIds = []) => {
            const removed = new Set(removedTaskIds)
            setPlannedActivities(current => current
              .filter(item => !removed.has(item.id))
              .map(item => item.id === updated.id ? updated : item))
            setEditCandidate(null)
          }}
          onClose={() => setEditCandidate(null)}
          onDelete={action => void deleteTask(editCandidate, action)}
        />
      )}
    </div>
  )
}
