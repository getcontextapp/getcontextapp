'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildResearchFollowupMessage, buildSmsComposeHref, isResearchFollowupDay } from '@/lib/research-followup'

type AnalyticsData = Awaited<ReturnType<typeof import('@/lib/pilot-analytics').loadPilotAnalytics>>
type Dyad = AnalyticsData['perDyad'][number]
type OutcomeRow = AnalyticsData['outcomeRows'][number]
type OutcomeScore = OutcomeRow['scores'][number]
type TabKey = 'health' | 'outcomes' | 'arc' | 'behavior' | 'sms' | 'readiness' | 'exports'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'health', label: 'Household health' },
  { key: 'outcomes', label: 'Outcomes' },
  { key: 'arc', label: 'Study arc' },
  { key: 'behavior', label: 'Behavior' },
  { key: 'sms', label: 'SMS' },
  { key: 'readiness', label: 'Pilot readiness' },
  { key: 'exports', label: 'Exports' },
]

const EXPORTS = [
  ['dyads', 'Household health'],
  ['outcome_rows', 'Outcome scores'],
  ['study_arc', 'Study arc'],
  ['events', 'Analytics events'],
  ['sms', 'SMS messages'],
  ['plans', 'Plans'],
  ['calendar_connections', 'Calendar connections'],
  ['calendar_events', 'Calendar events'],
  ['feature_flags', 'Feature flags'],
  ['pilot_readiness', 'Pilot readiness'],
]

function formatTime(value: string | null | undefined) {
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function phaseLabel(value: string) {
  const labels: Record<string, string> = { pre: 'Pre', active: 'Active', quiet: 'Quiet', complete: 'Complete' }
  return labels[value] ?? value
}

function flagLabel(value: string) {
  if (value === 'red') return 'Needs attention'
  if (value === 'amber') return 'Watch'
  return 'Quiet'
}

function exportHref(dataset: string, data: AnalyticsData) {
  const params = new URLSearchParams()
  params.set('dataset', dataset)
  params.set('days', String(data.filters.days))
  if (data.filters.householdId) params.set('household', data.filters.householdId)
  if (data.filters.role) params.set('role', data.filters.role)
  return `/api/admin/analytics/export?${params.toString()}`
}

function StatCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <article className="admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  )
}

function SilentDyadAlert({ dyads }: { dyads: Dyad[] }) {
  const silent = dyads.filter(dyad => dyad.silentHours > 48)
  if (silent.length === 0) return null
  return (
    <section className="silent-alert">
      <h2>Silent household alert</h2>
      <p>{silent.length} household{silent.length === 1 ? '' : 's'} had no activity in the past 48 hours.</p>
      <div className="alert-list">
        {silent.map(dyad => (
          <span key={dyad.id}>{dyad.displayLabel}: {dyad.silentHours} hours</span>
        ))}
      </div>
    </section>
  )
}

const SEEN_HOUSEHOLDS_KEY = 'context-admin-seen-households-v1'
const INITIAL_SIGNUP_LOOKBACK_DAYS = 7

function NewHouseholdAlert({ dyads }: { dyads: Dyad[] }) {
  const [newHouseholdIds, setNewHouseholdIds] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let seenIds: string[] | null = null
    try {
      const stored = window.localStorage.getItem(SEEN_HOUSEHOLDS_KEY)
      if (stored) seenIds = JSON.parse(stored) as string[]
    } catch {
      seenIds = null
    }

    if (seenIds) {
      const seen = new Set(seenIds)
      setNewHouseholdIds(dyads.filter(dyad => !seen.has(dyad.id)).map(dyad => dyad.id))
    } else {
      const cutoff = Date.now() - INITIAL_SIGNUP_LOOKBACK_DAYS * 86_400_000
      const recent = dyads.filter(dyad => new Date(dyad.householdCreatedAt).getTime() >= cutoff)
      setNewHouseholdIds(recent.map(dyad => dyad.id))
      if (recent.length === 0) {
        window.localStorage.setItem(SEEN_HOUSEHOLDS_KEY, JSON.stringify(dyads.map(dyad => dyad.id)))
      }
    }
    setReady(true)
  }, [dyads])

  const newHouseholds = dyads.filter(dyad => newHouseholdIds.includes(dyad.id))
  if (!ready || newHouseholds.length === 0) return null

  function markAsSeen() {
    let storedIds: string[] = []
    try {
      storedIds = JSON.parse(window.localStorage.getItem(SEEN_HOUSEHOLDS_KEY) ?? '[]') as string[]
    } catch {
      storedIds = []
    }
    window.localStorage.setItem(SEEN_HOUSEHOLDS_KEY, JSON.stringify([...new Set([...storedIds, ...dyads.map(dyad => dyad.id)])]))
    setNewHouseholdIds([])
  }

  return (
    <section className="signup-alert" aria-live="polite">
      <div>
        <p>New household {newHouseholds.length === 1 ? 'signup' : 'signups'}</p>
        <h2>{newHouseholds.length} new household{newHouseholds.length === 1 ? '' : 's'} joined Context</h2>
        <div className="signup-list">
          {newHouseholds.map(dyad => (
            <span key={dyad.id}>
              <strong>{dyad.name}</strong>
              <small>{formatTime(dyad.householdCreatedAt)} · {dyad.accountMode === 'solo' ? 'Solo' : 'Shared'} · {dyad.cohort === 'internal' ? 'Internal preview' : 'Participant pilot'}</small>
            </span>
          ))}
        </div>
      </div>
      <button type="button" onClick={markAsSeen}>Mark as seen</button>
    </section>
  )
}

function ScopeBar({ data, selectedCohort, setSelectedCohort, selectedMode, setSelectedMode, selectedHousehold, setSelectedHousehold }: {
  data: AnalyticsData
  selectedCohort: string
  setSelectedCohort: (value: string) => void
  selectedMode: string
  setSelectedMode: (value: string) => void
  selectedHousehold: string
  setSelectedHousehold: (value: string) => void
}) {
  const dyads = data.perDyad.filter(dyad =>
    (selectedCohort === 'all' || dyad.cohort === selectedCohort) &&
    (selectedMode === 'all' || dyad.accountMode === selectedMode)
  )
  return (
    <section className="scope-card">
      <div>
        <label htmlFor="cohort">Cohort</label>
        <select id="cohort" value={selectedCohort} onChange={event => { setSelectedCohort(event.target.value); setSelectedHousehold('all') }}>
          <option value="all">All cohorts</option>
          {data.cohorts.map(cohort => <option key={cohort.id} value={cohort.id}>{cohort.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="account-mode">Account</label>
        <select id="account-mode" value={selectedMode} onChange={event => { setSelectedMode(event.target.value); setSelectedHousehold('all') }}>
          <option value="all">Solo and shared</option>
          <option value="solo">Solo</option>
          <option value="shared">Shared</option>
        </select>
      </div>
      <div>
        <label htmlFor="dyad">Household</label>
        <select id="dyad" value={selectedHousehold} onChange={event => setSelectedHousehold(event.target.value)}>
          <option value="all">All households</option>
          {dyads.map(dyad => <option key={dyad.id} value={dyad.id}>{dyad.displayLabel}</option>)}
        </select>
      </div>
    </section>
  )
}

function DyadHealthPanel({ dyads }: { dyads: Dyad[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p>Household health panel</p>
        <h2>Who needs attention first?</h2>
      </div>
      <div className="dyad-grid">
        {dyads.map(dyad => (
          <article className={`dyad-card flag-${dyad.statusFlag}`} key={dyad.id}>
            <div className="dyad-topline">
              <div>
                <span>{dyad.code}</span>
                <h3>{dyad.name}</h3>
                <small className="account-badge">{dyad.accountMode === 'solo' ? 'Solo' : 'Shared'}</small>
              </div>
              <strong>{flagLabel(dyad.statusFlag)}</strong>
            </div>
            <dl>
              <div><dt>MCI</dt><dd>{dyad.mciName}</dd></div>
              <div><dt>Support person</dt><dd>{dyad.accountMode === 'solo' ? 'Not linked' : dyad.cpName}</dd></div>
              <div><dt>Study day</dt><dd>{dyad.currentStudyDay} of 28</dd></div>
              <div><dt>Phase</dt><dd>{phaseLabel(dyad.studyPhase)}</dd></div>
              <div><dt>MCI last active</dt><dd>{formatTime(dyad.mciLastActive)}</dd></div>
              {dyad.accountMode === 'shared' ? <div><dt>Support last active</dt><dd>{formatTime(dyad.cpLastActive)}</dd></div> : null}
              <div><dt>MCI SMS response</dt><dd>{dyad.mciSmsResponseRate}%</dd></div>
              <div><dt>Calendar</dt><dd>{dyad.calendarConnected ? `Connected${dyad.nextCalendarTitle ? `, next: ${dyad.nextCalendarTitle}` : ''}` : 'Not connected'}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function OutcomeScoresPanel({ rows }: { rows: OutcomeRow[] }) {
  const [saving, setSaving] = useState('')
  async function saveScore(row: OutcomeRow, score: OutcomeScore, session: 'pre' | 'post', value: string) {
    const numeric = Number(value)
    if (!score.profileId || !Number.isInteger(numeric)) return
    const key = `${row.householdId}:${score.key}:${session}`
    setSaving(key)
    await fetch('/api/admin/analytics/outcomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        householdId: row.householdId,
        profileId: score.profileId,
        role: score.role,
        session,
        measureKey: score.key,
        score: numeric,
      }),
    })
    window.location.reload()
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <p>Outcome scores</p>
        <h2>Manual pre and post measures</h2>
      </div>
      <div className="outcome-table">
        <table>
          <thead>
            <tr>
              <th>Dyad</th>
              {rows[0]?.scores.map(score => <th key={score.key}>{score.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.householdId}>
                <th>{row.householdName}<span>{phaseLabel(row.studyPhase)}</span></th>
                {row.scores.map(score => (
                  <td key={`${row.householdId}:${score.key}`}>
                    <label>Pre
                      <select value={score.pre ?? ''} disabled={!score.profileId || saving !== ''} onChange={event => saveScore(row, score, 'pre', event.target.value)}>
                        <option value="">-</option>
                        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label>Post
                      <select value={score.post ?? ''} disabled={!score.profileId || saving !== ''} onChange={event => saveScore(row, score, 'post', event.target.value)}>
                        <option value="">-</option>
                        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <strong>{score.delta === null ? 'Delta -' : `Delta ${score.delta > 0 ? '+' : ''}${score.delta}`}</strong>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StudyArcPanel({ data, dyads }: { data: AnalyticsData; dyads: Dyad[] }) {
  const rows = data.studyArc.filter(row => dyads.some(dyad => dyad.id === row.householdId))
  const [selection, setSelection] = useState<{ dyad: Dyad; day: number } | null>(null)
  const [openingMessages, setOpeningMessages] = useState(false)
  const [markingContacted, setMarkingContacted] = useState(false)
  const [composeOpened, setComposeOpened] = useState(false)
  const [error, setError] = useState('')
  const [contactedKeys, setContactedKeys] = useState<string[]>([])

  const openPersonalMessages = async () => {
    if (!selection) return
    setOpeningMessages(true)
    setError('')
    const response = await fetch('/api/admin/research-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ householdId: selection.dyad.id, milestoneDay: selection.day, action: 'compose' }),
    })
    const result = await response.json().catch(() => ({})) as { phone?: string; message?: string; error?: string }
    if (!response.ok || !result.phone || !result.message) {
      setError(result.error ?? 'Messages could not be opened.')
      setOpeningMessages(false)
      return
    }
    setComposeOpened(true)
    setOpeningMessages(false)
    const appleDevice = /(iPhone|iPad|iPod|Macintosh)/i.test(window.navigator.userAgent)
    window.location.href = buildSmsComposeHref(result.phone, result.message, appleDevice)
  }

  const markContacted = async () => {
    if (!selection) return
    setMarkingContacted(true)
    setError('')
    const response = await fetch('/api/admin/research-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ householdId: selection.dyad.id, milestoneDay: selection.day, action: 'mark_contacted' }),
    })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) {
      setError(result.error ?? 'The contact could not be recorded.')
      setMarkingContacted(false)
      return
    }
    setContactedKeys(keys => [...keys, `${selection.dyad.id}:${selection.day}`])
    setMarkingContacted(false)
    setComposeOpened(false)
    setSelection(null)
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <p>Study arc timeline</p>
        <h2>Day-by-day signal across 28 days</h2>
      </div>
      <div className="markers">Research follow-ups: days 2, 5, 10, 14. Select a reached day to prepare a CP text. Quiet period starts day 15.</div>
      <div className="arc-list">
        {rows.map(row => {
          const dyad = dyads.find(candidate => candidate.id === row.householdId)
          if (!dyad) return null
          return (
            <article key={row.householdId} className="arc-row">
              <h3>{row.householdName}</h3>
              <div className="arc-days">
                {row.days.map(day => {
                  const total = day.planLogged + day.planCompleted + day.smsReplied + day.contextViewed + (day.calendarItem ?? 0)
                  const followupDay = isResearchFollowupDay(day.day)
                  const contacted = dyad.researchFollowupDays.includes(day.day) || contactedKeys.includes(`${dyad.id}:${day.day}`)
                  const reached = day.day <= dyad.currentStudyDay
                  const available = followupDay && reached && Boolean(dyad.cpProfileId && dyad.cpPhoneLast4) && !contacted
                  const className = `arc-day ${total > 0 ? 'active' : ''} marker-${[2, 5, 10, 14, 15].includes(day.day)} ${available ? 'followup-ready' : ''} ${contacted ? 'followup-sent' : ''}`
                  const signalTitle = `Day ${day.day}: ${total} signals`
                  if (!followupDay) return <span key={day.day} className={className} title={signalTitle}>{day.day}</span>
                  const reason = contacted
                    ? 'care partner contacted'
                    : !reached
                      ? 'not reached yet'
                      : !dyad.cpPhoneLast4
                        ? 'CP phone unavailable'
                        : 'prepare CP research follow-up'
                  return (
                    <button
                      key={day.day}
                      type="button"
                      className={className}
                      disabled={!available}
                      title={`${signalTitle}; ${reason}`}
                      aria-label={`${row.householdName}, Day ${day.day}: ${reason}`}
                      onClick={() => {
                        setError('')
                        setComposeOpened(false)
                        setSelection({ dyad, day: day.day })
                      }}
                    >
                      {contacted ? '✓' : day.day}
                    </button>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>
      {selection ? (
        <div className="followup-confirm" role="dialog" aria-labelledby="followup-title">
          <div>
            <p>Manual researcher contact</p>
            <h3 id="followup-title">Prepare Day {selection.day} follow-up</h3>
            <span>To {selection.dyad.cpName} · phone ending {selection.dyad.cpPhoneLast4}</span>
          </div>
          <blockquote>{buildResearchFollowupMessage(selection.dyad.cpName, selection.day)}</blockquote>
          <small>This opens your Messages app. You review and send it from your personal number; Context will not send it automatically.</small>
          {composeOpened ? <div className="privacy-note">After sending the text in Messages, return here and mark the care partner as contacted.</div> : null}
          {error ? <div className="followup-error" role="alert">{error}</div> : null}
          <div className="followup-actions">
            <button type="button" className="primary-action" disabled={openingMessages || markingContacted} onClick={openPersonalMessages}>{openingMessages ? 'Opening…' : 'Open in Messages'}</button>
            {composeOpened ? <button type="button" className="primary-action" disabled={markingContacted || openingMessages} onClick={markContacted}>{markingContacted ? 'Saving…' : 'Mark as contacted'}</button> : null}
            <button type="button" className="secondary-action" disabled={openingMessages || markingContacted} onClick={() => {
              setComposeOpened(false)
              setSelection(null)
            }}>Cancel</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function BehaviorPanel({ data }: { data: AnalyticsData }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p>Behavior detail</p>
        <h2>Signals that explain dyad health</h2>
      </div>
      <div className="stats-grid">
        <StatCard label="Memory help attempts" value={data.recovery.attempts} />
        <StatCard label="Reflections saved" value={data.modality.reflectionSaved} />
        <StatCard label="Plans captured" value={data.threads.captured} />
        <StatCard label="Calendar items synced" value={data.exports.calendar_events?.length ?? 0} />
      </div>
      <div className="feature-list">
        {data.features.map(feature => (
          <article key={feature.name}>
            <span>{feature.label}</span>
            <strong>{feature.count}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

function SmsPanel({ data }: { data: AnalyticsData }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p>SMS reliability</p>
        <h2>Prompts, replies, and parsing</h2>
      </div>
      <div className="stats-grid">
        <StatCard label="Sent" value={data.sms.sent} />
        <StatCard label="Delivered" value={data.sms.delivered} />
        <StatCard label="Replies" value={data.sms.replied} />
        <StatCard label="Parsed replies" value={data.sms.parsed} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Dyad</th><th>Sent</th><th>Delivered</th><th>Replies</th><th>Median reply</th></tr></thead>
          <tbody>
            {data.perDyad.map(dyad => (
              <tr key={dyad.id}><td>{dyad.displayLabel}</td><td>{dyad.smsSent}</td><td>{dyad.smsDelivered}</td><td>{dyad.smsReplied}</td><td>{dyad.smsMedianLatency ?? '-'} min</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ReadinessPanel({ data }: { data: AnalyticsData }) {
  const checks = [
    ['Internal preview cohort', `${data.pilotReadiness.internalDyads} internal dyads found`, data.pilotReadiness.internalDyads >= 3],
    ['Pilot feature flags', `${data.pilotReadiness.pilotPreviewEnabled} dyads have pilot preview enabled`, data.pilotReadiness.pilotPreviewEnabled >= data.pilotReadiness.internalDyads],
    ['Calendar sync', `${data.pilotReadiness.calendarConnected} dyads connected`, data.pilotReadiness.calendarConnected > 0],
    ['Dyad linking', `${data.pilotReadiness.missingMci + data.pilotReadiness.missingCp} missing role links`, data.pilotReadiness.missingMci + data.pilotReadiness.missingCp === 0],
    ['Silence risk', `${data.pilotReadiness.silentDyads} silent dyads`, data.pilotReadiness.silentDyads === 0],
    ['Outcome capture', `${data.pilotReadiness.outcomesStarted} dyads have outcome scores started`, data.pilotReadiness.outcomesStarted > 0],
  ] as const
  return (
    <section className="panel">
      <div className="panel-heading">
        <p>Pilot readiness</p>
        <h2>Before participant rollout</h2>
      </div>
      <div className="readiness-list">
        {checks.map(([label, note, ok]) => (
          <article key={label} className={ok ? 'ready' : 'watch'}>
            <strong>{label}</strong>
            <span>{note}</span>
          </article>
        ))}
      </div>
      <div className="privacy-note">
        New features should stay with My Home, The Odu Household, and Baru Home until you approve rollout to participant households.
      </div>
    </section>
  )
}

function ExportsPanel({ data }: { data: AnalyticsData }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p>Export center</p>
        <h2>CSV files for study review</h2>
      </div>
      <div className="export-grid">
        {EXPORTS.map(([dataset, label]) => <a key={dataset} href={exportHref(dataset, data)}>{label}</a>)}
      </div>
    </section>
  )
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('health')
  const [selectedCohort, setSelectedCohort] = useState('all')
  const [selectedMode, setSelectedMode] = useState('all')
  const [selectedHousehold, setSelectedHousehold] = useState(data.filters.householdId || 'all')
  const dyads = useMemo(() => data.perDyad.filter(dyad =>
    (selectedCohort === 'all' || dyad.cohort === selectedCohort) &&
    (selectedMode === 'all' || dyad.accountMode === selectedMode) &&
    (selectedHousehold === 'all' || dyad.id === selectedHousehold)
  ), [data.perDyad, selectedCohort, selectedMode, selectedHousehold])
  const outcomeRows = data.outcomeRows.filter(row => dyads.some(dyad => dyad.id === row.householdId))

  useEffect(() => {
    const refresh = window.setInterval(() => router.refresh(), 60_000)
    return () => window.clearInterval(refresh)
  }, [router])

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <p>Context admin</p>
        <h1>Pilot monitoring</h1>
        <span>Generated {formatTime(data.generatedAt)} · Checking for new signups every minute</span>
      </header>
      <NewHouseholdAlert dyads={data.perDyad} />
      <SilentDyadAlert dyads={dyads} />
      <ScopeBar data={data} selectedCohort={selectedCohort} setSelectedCohort={setSelectedCohort} selectedMode={selectedMode} setSelectedMode={setSelectedMode} selectedHousehold={selectedHousehold} setSelectedHousehold={setSelectedHousehold} />
      <nav className="admin-tabs" aria-label="Analytics sections">
        {TABS.map(item => <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}
        <a className="standalone" href="/admin/pilot-interest">Pilot interest ↗</a>
      </nav>
      {tab === 'health' ? <DyadHealthPanel dyads={dyads} /> : null}
      {tab === 'outcomes' ? <OutcomeScoresPanel rows={outcomeRows} /> : null}
      {tab === 'arc' ? <StudyArcPanel data={data} dyads={dyads} /> : null}
      {tab === 'behavior' ? <BehaviorPanel data={data} /> : null}
      {tab === 'sms' ? <SmsPanel data={data} /> : null}
      {tab === 'readiness' ? <ReadinessPanel data={data} /> : null}
      {tab === 'exports' ? <ExportsPanel data={data} /> : null}
      <style jsx global>{`
        .admin-shell { min-height: 100vh; background: #f8f4ea; color: #27211a; padding: 32px; font-family: var(--font-sans, system-ui, sans-serif); }
        .admin-hero, .panel, .scope-card, .silent-alert, .signup-alert { max-width: 1180px; margin: 0 auto 22px; }
        .admin-hero p, .panel-heading p, .dyad-topline span { color: #4b7440; font-size: 0.78rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .admin-hero h1 { font-family: var(--font-serif, Georgia, serif); font-size: clamp(2.3rem, 5vw, 4.4rem); line-height: 1; margin: 8px 0; }
        .admin-hero span { color: #817669; }
        .scope-card, .panel, .silent-alert { background: #fffdfa; border: 1px solid #ead8b6; border-radius: 24px; box-shadow: 0 14px 36px rgba(44, 35, 24, .07); padding: 24px; }
        .scope-card { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        label { display: grid; gap: 7px; color: #6f6558; font-weight: 700; }
        select { min-height: 48px; border: 1px solid #ddceb8; border-radius: 12px; background: white; color: #27211a; padding: 0 14px; font: inherit; }
        .admin-tabs { max-width: 1180px; margin: 0 auto 22px; display: flex; gap: 10px; flex-wrap: wrap; }
        .admin-tabs button, .admin-tabs a, .export-grid a { min-height: 48px; border-radius: 999px; border: 1px solid #ddceb8; background: #fffdfa; color: #463b2d; padding: 0 18px; font-weight: 800; text-decoration: none; display: inline-grid; place-items: center; }
        .admin-tabs button.active { background: #3f6b36; color: white; border-color: #3f6b36; }
        .admin-tabs a.standalone { border-style: dashed; }
        .silent-alert { background: #fff7ed; border-color: #c9763e; }
        .signup-alert { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; background: #edf3ea; border: 1px solid #8dae84; border-radius: 24px; box-shadow: 0 14px 36px rgba(44, 35, 24, .07); padding: 24px; }
        .signup-alert p { margin: 0 0 5px; color: #4b7440; font-size: .78rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .signup-alert h2, .silent-alert h2, .panel h2 { margin: 0; font-family: var(--font-serif, Georgia, serif); font-size: 1.8rem; }
        .signup-alert button { min-height: 46px; flex: 0 0 auto; border: 0; border-radius: 999px; background: #3f6b36; color: white; padding: 0 18px; font: inherit; font-weight: 800; cursor: pointer; }
        .signup-list { display: grid; gap: 8px; margin-top: 16px; }
        .signup-list span { display: grid; gap: 2px; }
        .signup-list small { color: #6f6558; }
        .alert-list, .feature-list, .readiness-list, .export-grid, .dyad-grid, .stats-grid { display: grid; gap: 14px; }
        .alert-list { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .alert-list span { background: white; border-radius: 14px; padding: 14px; font-weight: 800; color: #8b3d20; }
        .panel-heading { margin-bottom: 22px; }
        .dyad-grid { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
        .dyad-card { border: 1px solid #e8dfd2; border-radius: 20px; padding: 20px; background: #fff; }
        .dyad-card.flag-red { border-color: #c9763e; }
        .dyad-card.flag-amber { border-color: #d9b96e; }
        .dyad-topline { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .dyad-topline h3 { margin: 5px 0 0; font-size: 1.3rem; }
        .account-badge { display: inline-block; margin-top: 8px; border-radius: 999px; background: #f1eadf; color: #6f6558; padding: 5px 9px; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
        .dyad-topline strong { background: #edf3ea; color: #3f6b36; padding: 8px 12px; border-radius: 999px; }
        .flag-red .dyad-topline strong { background: #fff0e7; color: #8b3d20; }
        .flag-amber .dyad-topline strong { background: #fbf0d9; color: #7b5a15; }
        dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 18px 0 0; }
        dt { color: #817669; font-size: .78rem; font-weight: 800; text-transform: uppercase; }
        dd { margin: 3px 0 0; font-weight: 800; }
        .outcome-table, .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; min-width: 760px; }
        th, td { border-bottom: 1px solid #eee2d1; padding: 14px; text-align: left; vertical-align: top; }
        th span { display: block; color: #817669; font-size: .82rem; margin-top: 4px; }
        td label { display: inline-grid; grid-template-columns: auto 64px; align-items: center; gap: 6px; margin-right: 8px; font-size: .82rem; }
        td strong { display: block; margin-top: 8px; color: #4b7440; }
        .markers { color: #6f6558; margin-bottom: 16px; }
        .arc-row { margin-bottom: 18px; }
        .arc-row h3 { margin: 0 0 10px; }
        .arc-days { display: grid; grid-template-columns: repeat(28, minmax(22px, 1fr)); gap: 5px; }
        .arc-day { min-height: 28px; border: 0; padding: 0; border-radius: 8px; background: #f0eadf; color: #817669; display: grid; place-items: center; font: inherit; font-size: .72rem; font-weight: 800; }
        .arc-day.active { background: #3f6b36; color: white; }
        .arc-day.marker-true { outline: 2px solid #c9763e; outline-offset: 1px; }
        button.arc-day:disabled { opacity: .58; }
        .arc-day.followup-ready { cursor: pointer; box-shadow: 0 0 0 3px rgba(201, 118, 62, .18); }
        .arc-day.followup-ready:hover, .arc-day.followup-ready:focus-visible { transform: translateY(-2px); outline-width: 3px; }
        .arc-day.followup-sent { background: #e3eee0; color: #31582a; outline-color: #4b7440; }
        .followup-confirm { margin-top: 22px; padding: 20px; border-radius: 18px; border: 1px solid #dfd1bd; background: #faf7f0; display: grid; gap: 14px; }
        .followup-confirm p { margin: 0 0 4px; color: #c05f28; font-size: .76rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .followup-confirm h3 { margin: 0 0 5px; }
        .followup-confirm span, .followup-confirm small { color: #6f6558; }
        .followup-confirm blockquote { margin: 0; padding: 16px; border-left: 4px solid #c9763e; border-radius: 8px; background: white; line-height: 1.55; }
        .followup-error { padding: 12px; border-radius: 10px; background: #f9e2df; color: #8d2f27; font-weight: 800; }
        .followup-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .followup-actions button { border: 0; border-radius: 999px; padding: 11px 18px; font-weight: 900; cursor: pointer; }
        .followup-actions button:disabled { cursor: wait; opacity: .6; }
        .primary-action { background: #3f6b36; color: white; }
        .secondary-action { background: #e9e0d3; color: #554c42; }
        .stats-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 18px; }
        .admin-stat, .feature-list article, .readiness-list article { background: #faf7f0; border-radius: 16px; padding: 16px; }
        .admin-stat span, .feature-list span { color: #817669; font-weight: 800; }
        .admin-stat strong { display: block; font-size: 2rem; margin-top: 5px; }
        .feature-list { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .feature-list article, .readiness-list article { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
        .feature-list strong { font-size: 1.5rem; }
        .readiness-list article.ready { border-left: 6px solid #3f6b36; }
        .readiness-list article.watch { border-left: 6px solid #c9763e; }
        .privacy-note { margin-top: 18px; border-radius: 16px; padding: 16px; background: #edf3ea; color: #3f6b36; font-weight: 800; }
        .export-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        @media (max-width: 720px) { .admin-shell { padding: 18px; } .scope-card { grid-template-columns: 1fr; } .signup-alert { display: grid; } dl { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  )
}
