import type { ReactNode } from 'react'
import Link from 'next/link'
import type { AnalyticsFilters } from '@/lib/pilot-analytics'

type AnalyticsData = Awaited<ReturnType<typeof import('@/lib/pilot-analytics').loadPilotAnalytics>>

function formatDate(value: string | null) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMinutes(value: number) {
  if (!value) return 'No replies yet'
  if (value < 60) return `${value} min`
  return `${(value / 60).toFixed(1)} hr`
}

function Card({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm-400">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold text-warm-900">{value}</p>
      {note && <p className="mt-1 text-xs text-warm-400">{note}</p>}
    </div>
  )
}

function LineChart({ data }: { data: AnalyticsData['daily'] }) {
  const width = 760
  const height = 230
  const padding = 30
  const max = Math.max(1, ...data.flatMap(day => [day.events, day.inbound, day.completions]))
  const points = (key: 'events' | 'inbound' | 'completions') => data.map((day, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2)
    const y = height - padding - (day[key] / max) * (height - padding * 2)
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full" role="img" aria-label="Daily engagement trend">
        {[0, .25, .5, .75, 1].map(tick => (
          <line key={tick} x1={padding} x2={width - padding} y1={height - padding - tick * (height - padding * 2)}
            y2={height - padding - tick * (height - padding * 2)} stroke="#E8D5B4" strokeWidth="1" />
        ))}
        <polyline points={points('events')} fill="none" stroke="#5A7A4A" strokeWidth="4" strokeLinejoin="round" />
        <polyline points={points('inbound')} fill="none" stroke="#C47448" strokeWidth="4" strokeLinejoin="round" />
        <polyline points={points('completions')} fill="none" stroke="#887E6E" strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <div className="flex flex-wrap gap-5 text-xs text-warm-500">
        <span><b className="text-sage-500">●</b> Product events</span>
        <span><b className="text-terracotta-400">●</b> SMS replies</span>
        <span><b className="text-warm-400">●</b> Task completions</span>
      </div>
    </div>
  )
}

function BarList({ rows }: { rows: AnalyticsData['features'] }) {
  const max = Math.max(1, ...rows.map(row => row.count))
  return (
    <div className="space-y-3">
      {rows.map(row => (
        <div key={row.name}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate text-warm-600">{row.name.replaceAll('_', ' ')}</span>
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

function exportUrl(dataset: string, filters: AnalyticsFilters) {
  const params = new URLSearchParams({
    dataset,
    days: String(filters.days),
    household: filters.householdId,
    role: filters.role,
  })
  return `/api/admin/analytics/export?${params}`
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const { kpis } = data

  return (
    <div className="min-h-svh bg-cream-50 text-warm-900">
      <header className="border-b border-cream-200 bg-warm-900 text-cream-50">
        <div className="mx-auto max-w-7xl px-5 py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cream-400">Context pilot intelligence</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-semibold">Engagement & SMS Analytics</h1>
              <p className="mt-1 text-sm text-cream-400">Live product usage, retention, response behavior, and participant journeys.</p>
            </div>
            <Link href="/" className="rounded-xl border border-cream-400/40 px-4 py-2 text-sm hover:bg-white/10">Back to Context</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-7">
        <form className="grid gap-3 rounded-2xl border border-cream-200 bg-white p-4 shadow-card md:grid-cols-[1fr_1fr_1fr_auto]">
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
            Household
            <select name="household" defaultValue={data.filters.householdId} className="mt-1 block w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-warm-800">
              <option value="">All households</option>
              {data.households.map(household => <option key={household.id} value={household.id}>{household.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-warm-400">
            Role
            <select name="role" defaultValue={data.filters.role} className="mt-1 block w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-warm-800">
              <option value="">All roles</option>
              <option value="mci_user">MCI members</option>
              <option value="care_partner">Care partners</option>
            </select>
          </label>
          <button className="self-end rounded-xl bg-warm-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-warm-900">Apply filters</button>
        </form>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Participants" value={kpis.profiles} note={`${kpis.households} connected households`} />
          <Card label="Active users" value={kpis.activeUsers} note={`${kpis.activationRate}% household activation`} />
          <Card label="Task completion" value={`${kpis.completionRate}%`} note={`${kpis.plans} plans · ${kpis.activities} activity logs`} />
          <Card label="Prompt response" value={`${kpis.promptResponseRate}%`} note={`Median ${formatMinutes(kpis.medianResponseMinutes)}`} />
          <Card label="Outbound SMS" value={kpis.outboundSms} note={`${kpis.smsFailureRate}% recorded failed`} />
          <Card label="SMS replies" value={kpis.inboundSms} note={`Average ${formatMinutes(kpis.averageResponseMinutes)}`} />
          {data.roleSummary.map(row => (
            <Card key={row.role} label={row.role === 'mci_user' ? 'MCI engagement' : 'Care partner engagement'}
              value={row.events} note={`${row.active}/${row.profiles} active · ${row.inboundSms} replies`} />
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
            <h2 className="font-serif text-xl font-semibold">Engagement trend</h2>
            <p className="mb-5 text-xs text-warm-400">Daily product events, participant SMS replies, and completed plans.</p>
            <LineChart data={data.daily} />
          </div>
          <div className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
            <h2 className="font-serif text-xl font-semibold">Feature adoption</h2>
            <p className="mb-5 text-xs text-warm-400">Most frequent tracked actions in the selected period.</p>
            <BarList rows={data.features} />
          </div>
        </section>

        <section className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold">Weekly retention cohorts</h2>
              <p className="text-xs text-warm-400">Percentage active in each week after profile creation.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-warm-400">
                <tr><th className="pb-3">Cohort</th><th className="pb-3">Size</th>{Array.from({ length: 8 }, (_, week) => <th key={week} className="pb-3 text-center">W{week}</th>)}</tr>
              </thead>
              <tbody>
                {data.cohorts.map(row => (
                  <tr key={row.cohort} className="border-t border-cream-100">
                    <td className="py-3 font-medium">{row.cohort}</td><td>{row.size}</td>
                    {row.retention.map((value, week) => (
                      <td key={week} className="p-1 text-center">
                        <span className="block rounded-lg py-2 text-xs font-semibold" style={{ backgroundColor: `rgba(90,122,74,${Math.max(.06, value / 100)})` }}>{value}%</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-cream-200 bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-serif text-xl font-semibold">Household health</h2><p className="text-xs text-warm-400">Connected members, completion, replies, and recent activity.</p></div>
            <a className="text-sm font-semibold text-terracotta-600 underline" href={exportUrl('households', data.filters)}>Export CSV</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-warm-400"><tr><th className="pb-3">Household</th><th>Members</th><th>Plans</th><th>Completion</th><th>SMS replies</th><th>Last active</th></tr></thead>
              <tbody>{data.householdRows.map(row => <tr key={row.id} className="border-t border-cream-100"><td className="py-3 font-semibold">{row.name}</td><td>{row.members}</td><td>{row.plans}</td><td>{row.completionRate}%</td><td>{row.smsReplies}</td><td>{formatDate(row.lastActive)}</td></tr>)}</tbody>
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
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-warm-400"><tr><th className="pb-3">Participant</th><th>Role</th><th>Household</th><th>Joined</th><th>First dashboard</th><th>First plan</th><th>First completion</th><th>First SMS reply</th><th>Last active</th></tr></thead>
              <tbody>{data.journeys.map(row => <tr key={row.profileId} className="border-t border-cream-100"><td className="py-3 font-semibold">{row.name}</td><td>{row.role === 'mci_user' ? 'MCI' : 'CP'}</td><td>{row.household}</td><td>{formatDate(row.joinedAt)}</td><td>{formatDate(row.firstDashboard)}</td><td>{formatDate(row.firstPlan)}</td><td>{formatDate(row.firstCompletion)}</td><td>{formatDate(row.firstSmsReply)}</td><td>{formatDate(row.lastActive)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <p className="pb-4 text-center text-xs text-warm-300">Generated {formatDate(data.generatedAt)} · Admin-only · Exports should be de-identified before research sharing.</p>
      </main>
    </div>
  )
}
