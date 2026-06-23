'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AnalyticsFilters, OutcomeRole, OutcomeSession } from '@/lib/pilot-analytics'

type AnalyticsData = Awaited<ReturnType<typeof import('@/lib/pilot-analytics').loadPilotAnalytics>>
type OutcomeRow = AnalyticsData['outcomeRows'][number]
type OutcomeScore = OutcomeRow['scores'][number]

type OutcomeEdit = {
  householdId: string
  householdName: string
  profileId: string | null
  role: OutcomeRole
  session: OutcomeSession
  measureKey: string
  label: string
  score: number | null
} | null

function formatDate(value: string | null) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatHours(value: number) {
  if (value < 1) return 'Less than 1 hour'
  if (value === 1) return '1 hour'
  return `${value} hours`
}

function phaseLabel(value: string) {
  return value[0].toUpperCase() + value.slice(1)
}

function flagClass(flag: string) {
  if (flag === 'red') return 'bg-terracotta-100 text-terracotta-700 border-terracotta-200'
  if (flag === 'amber') return 'bg-cream-200 text-warm-700 border-cream-300'
  return 'bg-sage-100 text-sage-700 border-sage-200'
}

function exportUrl(dataset: string, filters: AnalyticsFilters) {
  const params = new URLSearchParams({
    dataset,
    days: String(filters.days),
    household: filters.householdId,
    role: filters.role,
  })
  return `/api/admin/analytics/export?${params}`
}

function DyadHealthPanel({ data }: { data: AnalyticsData }) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Dyad health</h2>
          <p className="text-sm text-warm-500">One card per household, centered on study status and silence risk.</p>
        </div>
        <a className="text-sm font-semibold text-terracotta-600 underline" href={exportUrl('dyads', data.filters)}>Export CSV</a>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {data.dyads.map(dyad => (
          <article key={dyad.id} className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-xl font-semibold text-warm-900">{dyad.name}</h3>
                <p className="mt-1 text-sm text-warm-500">{dyad.mciName} + {dyad.cpName}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${flagClass(dyad.statusFlag)}`}>
                {dyad.statusFlag}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-warm-400">Study day</dt>
                <dd className="mt-1 font-semibold">{dyad.daysSinceOnboarding}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-warm-400">Phase</dt>
                <dd className="mt-1 font-semibold">{phaseLabel(dyad.studyPhase)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-warm-400">MCI last active</dt>
                <dd className="mt-1">{formatDate(dyad.mciLastActive)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-warm-400">CP last active</dt>
                <dd className="mt-1">{formatDate(dyad.cpLastActive)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-warm-400">MCI SMS response rate</dt>
                <dd className="mt-2 flex items-center gap-3">
                  <span className="font-serif text-2xl font-semibold">{dyad.mciSmsResponseRate}%</span>
                  <span className="h-2 flex-1 rounded-full bg-cream-100">
                    <span className="block h-2 rounded-full bg-sage-500" style={{ width: `${dyad.mciSmsResponseRate}%` }} />
                  </span>
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function OutcomeCell({
  row,
  score,
  session,
  onEdit,
}: {
  row: OutcomeRow
  score: OutcomeScore
  session: OutcomeSession
  onEdit: (edit: NonNullable<OutcomeEdit>) => void
}) {
  const value = session === 'pre' ? score.pre : score.post
  const profileId = score.role === 'mci' ? row.mciProfileId : row.cpProfileId

  return (
    <button
      type="button"
      onClick={() => onEdit({
        householdId: row.householdId,
        householdName: row.householdName,
        profileId,
        role: score.role,
        session,
        measureKey: score.key,
        label: score.label,
        score: value,
      })}
      className="min-h-9 rounded-lg border border-cream-200 bg-cream-50 px-2 text-sm font-semibold text-warm-800 hover:bg-white focus:outline-none focus:ring-2 focus:ring-sage-300"
    >
      {value ?? 'Enter'}
    </button>
  )
}

function OutcomeScoresPanel({ data, onSaved }: { data: AnalyticsData; onSaved: (row: OutcomeRow) => void }) {
  const [edit, setEdit] = useState<OutcomeEdit>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveScore(score: number) {
    if (!edit) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/analytics/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...edit, score }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error ?? 'Could not save score.')
        return
      }
      onSaved(result.row)
      setEdit(null)
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold">Outcome scores</h2>
          <p className="text-xs text-warm-400">Manual pre and post scores. Delta is post minus pre.</p>
        </div>
        <a className="text-sm font-semibold text-terracotta-600 underline" href={exportUrl('outcomes', data.filters)}>Export CSV</a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-warm-400">
            <tr>
              <th className="pb-3">Dyad</th>
              <th className="pb-3">Phase</th>
              {data.outcomeMeasures.map(measure => (
                <th key={`${measure.role}-${measure.key}`} className="pb-3">{measure.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.outcomeRows.map(row => (
              <tr key={row.householdId} className="border-t border-cream-100 align-top">
                <td className="py-3 font-semibold">{row.householdName}</td>
                <td className="py-3">{phaseLabel(row.studyPhase)}</td>
                {row.scores.map(score => (
                  <td key={`${score.role}-${score.key}`} className="py-3 pr-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warm-400">Pre</p>
                        <OutcomeCell row={row} score={score} session="pre" onEdit={setEdit} />
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warm-400">Post</p>
                        <OutcomeCell row={row} score={score} session="post" onEdit={setEdit} />
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warm-400">Delta</p>
                        <span className="flex min-h-9 items-center justify-center rounded-lg bg-white px-2 text-sm font-semibold text-warm-700">
                          {score.delta === null ? '-' : score.delta > 0 ? `+${score.delta}` : score.delta}
                        </span>
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-end bg-warm-900/35 px-4 py-6 sm:items-center" role="dialog" aria-modal="true">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-cream-200 bg-cream-50 p-5 shadow-float">
            <h3 className="font-serif text-xl font-semibold">Enter score</h3>
            <p className="mt-1 text-sm text-warm-500">{edit.householdName}: {edit.label}, {edit.session}</p>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map(score => (
                <button
                  key={score}
                  type="button"
                  onClick={() => saveScore(score)}
                  disabled={saving}
                  className={`min-h-12 rounded-xl border text-base font-semibold focus:outline-none focus:ring-2 focus:ring-sage-300 ${
                    edit.score === score ? 'border-sage-500 bg-sage-100 text-sage-800' : 'border-cream-300 bg-white text-warm-800'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-terracotta-700">{error}</p>}
            <button type="button" onClick={() => setEdit(null)} className="mt-5 min-h-11 w-full rounded-xl border border-cream-300 bg-white text-sm font-semibold text-warm-600">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function StudyArcTimeline({ data }: { data: AnalyticsData }) {
  const markers = new Set([2, 5, 10, 14, 15])
  const dotTypes = [
    ['planLogged', 'bg-sage-500', 'Plan logged'],
    ['planCompleted', 'bg-warm-500', 'Plan completed'],
    ['smsReplied', 'bg-terracotta-500', 'SMS replied'],
    ['contextViewed', 'bg-cream-500', 'Context viewed'],
  ] as const

  return (
    <section className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
      <h2 className="font-serif text-xl font-semibold">Study arc timeline</h2>
      <p className="mb-5 text-xs text-warm-400">Days 1 to 28 from onboarding. Markers show days 2, 5, 10, 14, and quiet period start on day 15.</p>
      <div className="space-y-5 overflow-x-auto">
        {data.studyArc.map(row => (
          <div key={row.householdId} className="min-w-[900px]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{row.householdName}</p>
              <p className="text-xs text-warm-400">{phaseLabel(row.studyPhase)}</p>
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(28, minmax(0, 1fr))' }}>
              {row.days.map(day => (
                <div key={day.day} className={`relative min-h-14 rounded-lg border px-1 py-1 ${markers.has(day.day) ? 'border-warm-400 bg-cream-100' : 'border-cream-100 bg-cream-50'}`}>
                  <p className="text-[10px] font-semibold text-warm-400">{day.day}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {dotTypes.map(([key, color, label]) => day[key] > 0 && (
                      <span key={key} title={`${label}: ${day[key]}`} className={`h-2.5 w-2.5 rounded-full ${color}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-warm-500">
        {dotTypes.map(([, color, label]) => <span key={label}><b className={`${color} inline-block h-2.5 w-2.5 rounded-full`} /> {label}</span>)}
      </div>
    </section>
  )
}

function BarList({ rows }: { rows: AnalyticsData['features'] }) {
  const max = Math.max(1, ...rows.map(row => row.count))
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-warm-400">No study-facing events in this period.</p>}
      {rows.map(row => (
        <div key={row.name}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate text-warm-600">{row.label}</span>
            <span className="font-semibold text-warm-800">{row.count}</span>
          </div>
          <div className="h-2 rounded-full bg-cream-100">
            <div className="h-2 rounded-full bg-sage-400" style={{ width: `${Math.max(3, row.count / max * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsDashboard({ data: initialData }: { data: AnalyticsData }) {
  const [data, setData] = useState(initialData)

  function updateOutcomeRow(row: OutcomeRow) {
    setData(current => ({
      ...current,
      outcomeRows: current.outcomeRows.map(existing => existing.householdId === row.householdId ? row : existing),
    }))
  }

  return (
    <div className="min-h-svh bg-cream-50 text-warm-900">
      <header className="border-b border-cream-200 bg-warm-900 text-cream-50">
        <div className="mx-auto max-w-7xl px-5 py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cream-400">Context study monitoring</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-semibold">Dyad Study Console</h1>
              <p className="mt-1 text-sm text-cream-400">Dyad health, study arc activity, outcomes, and operational silence flags.</p>
            </div>
            <Link href="/" className="rounded-xl border border-cream-400/40 px-4 py-2 text-sm hover:bg-white/10">Back to Context</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-7">
        {data.silentDyads.length > 0 && (
          <section className="rounded-2xl border border-terracotta-200 bg-terracotta-50 p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terracotta-700">Silent dyad alert</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {data.silentDyads.map(dyad => (
                <div key={dyad.id} className="rounded-xl bg-white px-4 py-3 text-sm">
                  <span className="font-semibold">{dyad.name}</span>
                  <span className="text-warm-500"> has had no activity for {formatHours(dyad.silentHours)}.</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <form className="grid gap-3 rounded-2xl border border-cream-200 bg-white p-4 shadow-card md:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-semibold uppercase tracking-wide text-warm-400">
            Period
            <select name="days" defaultValue={data.filters.days} className="mt-1 block w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-warm-800">
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="60">Last 60 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-warm-400">
            Dyad
            <select name="household" defaultValue={data.filters.householdId} className="mt-1 block w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-warm-800">
              <option value="">All dyads</option>
              {data.households.map(household => <option key={household.id} value={household.id}>{household.name}</option>)}
            </select>
          </label>
          <button className="self-end rounded-xl bg-warm-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-warm-900">Apply filters</button>
        </form>

        <DyadHealthPanel data={data} />
        <OutcomeScoresPanel data={data} onSaved={updateOutcomeRow} />
        <StudyArcTimeline data={data} />

        <section className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
          <h2 className="font-serif text-xl font-semibold">Study activity adoption</h2>
          <p className="mb-5 text-xs text-warm-400">Study-facing tracked actions in the selected period.</p>
          <BarList rows={data.features} />
        </section>

        <section className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-serif text-xl font-semibold">Household health</h2><p className="text-xs text-warm-400">Dyad phase, completion, replies, and recent activity.</p></div>
            <a className="text-sm font-semibold text-terracotta-600 underline" href={exportUrl('households', data.filters)}>Export CSV</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-warm-400"><tr><th className="pb-3">Household</th><th>Study phase</th><th>Members</th><th>Plans</th><th>Completion</th><th>SMS replies</th><th>Last active</th><th>Status</th></tr></thead>
              <tbody>{data.householdRows.map(row => <tr key={row.id} className="border-t border-cream-100"><td className="py-3 font-semibold">{row.name}</td><td>{phaseLabel(row.studyPhase)}</td><td>{row.members}</td><td>{row.plans}</td><td>{row.completionRate}%</td><td>{row.smsReplies}</td><td>{formatDate(row.lastActive)}</td><td><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${flagClass(row.statusFlag)}`}>{row.statusFlag}</span></td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-serif text-xl font-semibold">Participant journeys</h2><p className="text-xs text-warm-400">Onboarding through dashboard use, planning, completion, and SMS response.</p></div>
            <div className="flex flex-wrap gap-3 text-sm font-semibold text-terracotta-600">
              <a className="underline" href={exportUrl('journeys', data.filters)}>Journeys CSV</a>
              <a className="underline" href={exportUrl('events', data.filters)}>Events CSV</a>
              <a className="underline" href={exportUrl('sms', data.filters)}>SMS CSV</a>
              <a className="underline" href={exportUrl('plans', data.filters)}>Plans CSV</a>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-warm-400"><tr><th className="pb-3">Participant</th><th>Role</th><th>Household</th><th>Study phase</th><th>Joined</th><th>First dashboard</th><th>First plan</th><th>First completion</th><th>First SMS reply</th><th>Last active</th></tr></thead>
              <tbody>{data.journeys.map(row => <tr key={row.profileId} className="border-t border-cream-100"><td className="py-3 font-semibold">{row.name}</td><td>{row.roleLabel}</td><td>{row.household}</td><td>{phaseLabel(row.studyPhase)}</td><td>{formatDate(row.joinedAt)}</td><td>{formatDate(row.firstDashboard)}</td><td>{formatDate(row.firstPlan)}</td><td>{formatDate(row.firstCompletion)}</td><td>{formatDate(row.firstSmsReply)}</td><td>{formatDate(row.lastActive)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <p className="pb-4 text-center text-xs text-warm-300">Generated {formatDate(data.generatedAt)} · Admin-only · Exports should be de-identified before research sharing.</p>
      </main>
    </div>
  )
}
