'use client'

import { useMemo, useState, type ReactNode } from 'react'
import styles from './visualizations.module.css'

type AnalyticsData = Awaited<ReturnType<typeof import('@/lib/pilot-analytics').loadPilotAnalytics>>
type Dyad = AnalyticsData['perDyad'][number]
type Arc = AnalyticsData['studyArc'][number]
type ViewKey = 'overview' | 'engagement' | 'journeys'

const SIGNAL_LABELS = ['Captures', 'Completions', 'SMS replies', 'App views', 'Calendar']
const SIGNAL_COLORS = ['#356859', '#8bb36e', '#d5a34f', '#7283a7', '#ba7b72']

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null
}

function percent(value: number | null) {
  return value === null ? '—' : `${value}%`
}

function signalTotal(day: Arc['days'][number]) {
  return day.planLogged + day.planCompleted + day.smsReplied + day.contextViewed + day.calendarItem
}

function KpiCard({ label, value, note, tone = 'green' }: { label: string; value: string | number; note: string; tone?: 'green' | 'gold' | 'blue' | 'rose' }) {
  return <article className={`${styles.kpiCard} ${styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>
    <div className={styles.kpiTop}><span>{label}</span><i /></div>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>
}

function Panel({ eyebrow, title, action, children, className = '' }: { eyebrow: string; title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`${styles.panel} ${className}`}>
    <header className={styles.panelHeader}><div><p>{eyebrow}</p><h2>{title}</h2></div>{action}</header>
    {children}
  </section>
}

function RetentionChart({ values }: { values: Array<number | null> }) {
  const width = 900
  const height = 300
  const plotLeft = 48
  const plotRight = 880
  const plotTop = 24
  const plotBottom = 248
  const valid = values.map((value, index) => ({ value, index })).filter((point): point is { value: number; index: number } => point.value !== null)
  const point = ({ value, index }: { value: number; index: number }) => ({
    x: plotLeft + (index / Math.max(1, values.length - 1)) * (plotRight - plotLeft),
    y: plotBottom - (value / 100) * (plotBottom - plotTop),
  })
  const line = valid.map(item => { const p = point(item); return `${p.x},${p.y}` }).join(' ')
  const area = valid.length ? `M ${point(valid[0]).x} ${plotBottom} L ${valid.map(item => { const p = point(item); return `${p.x} ${p.y}` }).join(' L ')} L ${point(valid[valid.length - 1]).x} ${plotBottom} Z` : ''

  return <div className={styles.chartFrame}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Percentage of eligible households active by study day">
      <defs><linearGradient id="retentionArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f7c6d" stopOpacity=".28" /><stop offset="100%" stopColor="#4f7c6d" stopOpacity=".02" /></linearGradient></defs>
      {[0, 25, 50, 75, 100].map(value => { const y = plotBottom - (value / 100) * (plotBottom - plotTop); return <g key={value}><line x1={plotLeft} y1={y} x2={plotRight} y2={y} stroke="#e6e9e4" strokeDasharray={value === 0 ? '0' : '4 6'} /><text x="38" y={y + 4} textAnchor="end" className={styles.axisText}>{value}%</text></g> })}
      {area ? <path d={area} fill="url(#retentionArea)" /> : null}
      <polyline points={line} fill="none" stroke="#356859" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {valid.map(item => { const p = point(item); return <circle key={item.index} cx={p.x} cy={p.y} r="5" fill="#fff" stroke="#356859" strokeWidth="3"><title>{`Day ${item.index + 1}: ${item.value}% active`}</title></circle> })}
      {[1, 7, 14, 21, 28].map(day => <text key={day} x={plotLeft + ((day - 1) / 27) * (plotRight - plotLeft)} y="278" textAnchor="middle" className={styles.axisText}>Day {day}</text>)}
    </svg>
  </div>
}

function AdoptionBars({ rows }: { rows: Array<{ label: string; value: number; count: number }> }) {
  return <div className={styles.adoptionList}>{rows.map(row => <div className={styles.adoptionRow} key={row.label}>
    <div><span>{row.label}</span><strong>{row.value}% <small>{row.count} households</small></strong></div>
    <div className={styles.barTrack}><i style={{ width: `${row.value}%` }} /></div>
  </div>)}</div>
}

function LoopChart({ captured, completed, moved, unresolved }: { captured: number; completed: number; moved: number; unresolved: number }) {
  const knownOutcomes = completed + moved + unresolved
  const rows = [
    { label: 'Captured intentions', value: captured, color: '#356859' },
    { label: 'Completed', value: completed, color: '#7aa05e' },
    { label: 'Moved or closed', value: moved, color: '#d5a34f' },
    { label: 'Past and unresolved', value: unresolved, color: '#ba6f67' },
  ]
  const max = Math.max(1, ...rows.map(row => row.value))
  return <div className={styles.loopBlock}>
    <div className={styles.loopBars}>{rows.map(row => <div key={row.label}><span>{row.label}</span><div><i style={{ width: `${Math.max(3, (row.value / max) * 100)}%`, background: row.color }} /></div><strong>{row.value}</strong></div>)}</div>
    <div className={styles.definitionNote}><strong>{percent(rate(completed, knownOutcomes))}</strong><span>of tasks with a known outcome were completed. This denominator prevents impossible rates above 100%.</span></div>
  </div>
}

function RoleDonut({ participant, partner }: { participant: number; partner: number }) {
  const total = participant + partner
  const participantRate = rate(participant, total) ?? 0
  return <div className={styles.donutLayout}>
    <div className={styles.donut} style={{ background: `conic-gradient(#356859 0 ${participantRate}%, #d9b36a ${participantRate}% 100%)` }}><div><strong>{participantRate}%</strong><span>self-captured</span></div></div>
    <div className={styles.legendList}><span><i style={{ background: '#356859' }} />Participant<strong>{participant}</strong></span><span><i style={{ background: '#d9b36a' }} />Care partner<strong>{partner}</strong></span></div>
  </div>
}

function Heatmap({ arcs, dyads }: { arcs: AnalyticsData['studyArc']; dyads: Dyad[] }) {
  return <div className={styles.heatmapScroller}>
    <div className={styles.heatmap}>
      <div className={styles.heatHeader}><span>Household</span>{Array.from({ length: 28 }, (_, index) => <b key={index}>{index + 1}</b>)}</div>
      {arcs.filter(arc => dyads.some(dyad => dyad.id === arc.householdId)).map(arc => <div className={styles.heatRow} key={arc.householdId}>
        <span>{dyads.find(dyad => dyad.id === arc.householdId)?.code ?? arc.householdName}</span>
        {arc.days.map(day => { const value = signalTotal(day); const level = value === 0 ? 0 : value < 4 ? 1 : value < 10 ? 2 : value < 25 ? 3 : 4; return <i key={day.day} data-level={level}><title>{`${arc.householdName}, Day ${day.day}: ${value} meaningful signals`}</title></i> })}
      </div>)}
    </div>
    <div className={styles.heatLegend}><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}<span>More</span></div>
  </div>
}

function SignalMix({ dyads, arcs }: { dyads: Dyad[]; arcs: AnalyticsData['studyArc'] }) {
  const totals = [0, 0, 0, 0, 0]
  arcs.filter(arc => dyads.some(dyad => dyad.id === arc.householdId)).forEach(arc => arc.days.forEach(day => {
    totals[0] += day.planLogged
    totals[1] += day.planCompleted
    totals[2] += day.smsReplied
    totals[3] += day.contextViewed
    totals[4] += day.calendarItem
  }))
  const total = totals.reduce((sum, value) => sum + value, 0)
  return <div className={styles.mixBlock}>
    <div className={styles.mixBar}>{totals.map((value, index) => <i key={SIGNAL_LABELS[index]} style={{ width: `${rate(value, total) ?? 0}%`, background: SIGNAL_COLORS[index] }}><title>{`${SIGNAL_LABELS[index]}: ${value}`}</title></i>)}</div>
    <div className={styles.mixLegend}>{totals.map((value, index) => <span key={SIGNAL_LABELS[index]}><i style={{ background: SIGNAL_COLORS[index] }} /><b>{SIGNAL_LABELS[index]}</b><strong>{value}</strong></span>)}</div>
  </div>
}

export default function VisualizationDashboard({ data }: { data: AnalyticsData }) {
  const [view, setView] = useState<ViewKey>('overview')
  const [cohort, setCohort] = useState('pilot-1')
  const [mode, setMode] = useState('all')
  const [household, setHousehold] = useState('all')

  const dyads = useMemo(() => data.perDyad.filter(dyad =>
    (cohort === 'all' || dyad.cohort === cohort) &&
    (mode === 'all' || dyad.accountMode === mode) &&
    (household === 'all' || dyad.id === household)
  ), [data.perDyad, cohort, mode, household])

  const arcs = data.studyArc
  const totals = useMemo(() => ({
    captured: dyads.reduce((sum, dyad) => sum + dyad.captured, 0),
    completed: dyads.reduce((sum, dyad) => sum + dyad.completed, 0),
    moved: dyads.reduce((sum, dyad) => sum + dyad.features.filter(feature => ['planned_activity_moved', 'planned_activity_deleted'].includes(feature.name)).reduce((n, feature) => n + feature.count, 0), 0),
    unresolved: dyads.reduce((sum, dyad) => sum + dyad.unresolved, 0),
    mciPlans: dyads.reduce((sum, dyad) => sum + dyad.mciPlansCreated, 0),
    cpPlans: dyads.reduce((sum, dyad) => sum + dyad.cpPlansCreated, 0),
    recoveryAttempts: dyads.reduce((sum, dyad) => sum + dyad.attempts, 0),
    recoveryResumed: dyads.reduce((sum, dyad) => sum + dyad.resumed, 0),
    prompts: dyads.reduce((sum, dyad) => sum + dyad.smsPromptSent, 0),
    promptReplies: dyads.reduce((sum, dyad) => sum + dyad.smsPromptAnswered, 0),
  }), [dyads])

  const activation = rate(dyads.filter(dyad => dyad.captured > 0 || dyad.attempts > 0).length, dyads.length)
  const retained14Eligible = dyads.filter(dyad => dyad.currentStudyDay >= 14)
  const retained14 = retained14Eligible.filter(dyad => {
    const arc = arcs.find(item => item.householdId === dyad.id)
    return arc?.days.some(day => day.day >= 8 && day.day <= 14 && signalTotal(day) > 0)
  }).length
  const knownOutcomes = totals.completed + totals.moved + totals.unresolved
  const retention = Array.from({ length: 28 }, (_, index) => {
    const day = index + 1
    const eligible = dyads.filter(dyad => dyad.currentStudyDay >= day)
    if (!eligible.length) return null
    const active = eligible.filter(dyad => arcs.find(arc => arc.householdId === dyad.id)?.days.some(item => item.day === day && signalTotal(item) > 0)).length
    return rate(active, eligible.length)
  })

  const adoption = [
    { label: 'Captured a plan', count: dyads.filter(dyad => dyad.captured > 0).length },
    { label: 'Completed a task', count: dyads.filter(dyad => dyad.completed > 0).length },
    { label: 'Replied by SMS', count: dyads.filter(dyad => dyad.smsReplied > 0).length },
    { label: 'Connected calendar', count: dyads.filter(dyad => dyad.calendarConnected).length },
    { label: 'Used memory recovery', count: dyads.filter(dyad => dyad.attempts > 0).length },
    { label: 'Saved a reflection', count: dyads.filter(dyad => dyad.reflectionsSaved > 0).length },
  ].map(row => ({ ...row, value: rate(row.count, dyads.length) ?? 0 }))

  const selectedDyad = household === 'all' ? dyads[0] : dyads.find(dyad => dyad.id === household)
  const selectedArc = selectedDyad ? arcs.find(arc => arc.householdId === selectedDyad.id) : null
  const householdOptions = data.perDyad.filter(dyad => (cohort === 'all' || dyad.cohort === cohort) && (mode === 'all' || dyad.accountMode === mode))

  const changePeriod = (days: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set('days', days)
    window.location.search = params.toString()
  }

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <a className={styles.brand} href="/admin/analytics"><span>C</span><div><strong>Context</strong><small>Analytics</small></div></a>
      <nav aria-label="Visualization sections">{([['overview', 'Executive overview'], ['engagement', 'Product engagement'], ['journeys', 'Participant journeys']] as const).map(([key, label]) => <button key={key} className={view === key ? styles.activeNav : ''} onClick={() => setView(key)}>{label}</button>)}</nav>
      <a className={styles.backLink} href="/admin/analytics">Admin dashboard</a>
    </header>

    <div className={styles.content}>
      <section className={styles.pageIntro}>
        <div><p>Evidence dashboard</p><h1>{view === 'overview' ? 'The state of Context' : view === 'engagement' ? 'How people use Context' : 'Household journeys'}</h1><span>{view === 'overview' ? 'A clear view of adoption, follow-through, and independence.' : view === 'engagement' ? 'Feature adoption, persistence, channels, and cognitive load.' : 'Understand individual engagement without exposing private content.'}</span></div>
        <div className={styles.freshness}><i /><span>Data current</span><small>Updated {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(data.generatedAt))}</small></div>
      </section>

      <section className={styles.filters} aria-label="Analytics filters">
        <label><span>Period</span><select value={String(data.filters.days)} onChange={event => changePeriod(event.target.value)}>{[7, 14, 30, 60, 90].map(days => <option key={days} value={days}>Last {days} days</option>)}</select></label>
        <label><span>Cohort</span><select value={cohort} onChange={event => { setCohort(event.target.value); setHousehold('all') }}><option value="pilot-1">Participant pilot</option><option value="internal">Internal preview</option><option value="all">All cohorts</option></select></label>
        <label><span>Account</span><select value={mode} onChange={event => { setMode(event.target.value); setHousehold('all') }}><option value="all">Solo and shared</option><option value="solo">Solo</option><option value="shared">Shared</option></select></label>
        {view === 'journeys' ? <label className={styles.householdFilter}><span>Household</span><select value={household} onChange={event => setHousehold(event.target.value)}>{householdOptions.map(dyad => <option key={dyad.id} value={dyad.id}>{dyad.displayLabel}</option>)}</select></label> : null}
      </section>

      {view === 'overview' ? <>
        <section className={styles.kpiGrid}>
          <KpiCard label="Households" value={dyads.length} note={`${dyads.filter(dyad => dyad.accountMode === 'solo').length} solo · ${dyads.filter(dyad => dyad.accountMode === 'shared').length} shared`} />
          <KpiCard label="Activation" value={percent(activation)} note="Captured a plan or used recovery" tone="blue" />
          <KpiCard label="Week 2 retention" value={percent(rate(retained14, retained14Eligible.length))} note={`${retained14} of ${retained14Eligible.length} eligible households`} tone="gold" />
          <KpiCard label="Known-task completion" value={percent(rate(totals.completed, knownOutcomes))} note={`${totals.completed} completed outcomes`} />
          <KpiCard label="Participant self-capture" value={percent(rate(totals.mciPlans, totals.mciPlans + totals.cpPlans))} note={`${totals.mciPlans} participant-created plans`} tone="blue" />
          <KpiCard label="Recovery resumed" value={percent(rate(totals.recoveryResumed, totals.recoveryAttempts))} note={`${totals.recoveryResumed} of ${totals.recoveryAttempts} attempts`} tone="rose" />
        </section>

        <div className={styles.featureGrid}>
          <Panel eyebrow="Retention" title="Active households by study day" className={styles.widePanel} action={<span className={styles.metricPill}>Eligible households only</span>}><p className={styles.panelCopy}>The share of households producing at least one meaningful signal on each study day.</p><RetentionChart values={retention} /></Panel>
          <Panel eyebrow="Core hypothesis" title="Closing the intention loop"><LoopChart captured={totals.captured} completed={totals.completed} moved={totals.moved} unresolved={totals.unresolved} /></Panel>
        </div>

        <div className={styles.equalGrid}>
          <Panel eyebrow="Feature adoption" title="Breadth of product use"><AdoptionBars rows={adoption} /></Panel>
          <Panel eyebrow="Independence" title="Who creates the plan?"><RoleDonut participant={totals.mciPlans} partner={totals.cpPlans} /><div className={styles.insight}><span>Interpretation</span><p>A higher participant share suggests self-management; it does not alone prove reduced care-partner burden.</p></div></Panel>
        </div>
      </> : null}

      {view === 'engagement' ? <>
        <section className={styles.kpiGrid}>
          <KpiCard label="Meaningful captures" value={totals.captured} note="Plans and contextual records" />
          <KpiCard label="SMS response" value={percent(rate(totals.promptReplies, totals.prompts))} note={`${totals.promptReplies} of ${totals.prompts} prompts`} tone="gold" />
          <KpiCard label="Calendar adoption" value={percent(rate(dyads.filter(dyad => dyad.calendarConnected).length, dyads.length))} note={`${dyads.filter(dyad => dyad.calendarConnected).length} connected households`} tone="blue" />
          <KpiCard label="Recovery adoption" value={percent(rate(dyads.filter(dyad => dyad.attempts > 0).length, dyads.length))} note="Used Need Help Remembering" tone="rose" />
        </section>
        <Panel eyebrow="Persistence" title="Daily engagement by household" action={<span className={styles.metricPill}>Study days 1–28</span>}><p className={styles.panelCopy}>Darker squares mean more meaningful signals. Hover for the exact count.</p><Heatmap arcs={arcs} dyads={dyads} /></Panel>
        <div className={styles.equalGrid}>
          <Panel eyebrow="Behavior mix" title="What engagement consists of"><SignalMix dyads={dyads} arcs={arcs} /></Panel>
          <Panel eyebrow="Channels" title="Reminder effectiveness"><div className={styles.channelStats}><article><span>SMS delivered</span><strong>{dyads.reduce((sum, dyad) => sum + dyad.smsDelivered, 0)}</strong></article><article><span>SMS replies</span><strong>{dyads.reduce((sum, dyad) => sum + dyad.smsReplied, 0)}</strong></article><article><span>Push sent</span><strong>{dyads.reduce((sum, dyad) => sum + dyad.pushSent, 0)}</strong></article><article><span>2-hour nudge response</span><strong>{percent(rate(dyads.reduce((sum, dyad) => sum + dyad.nudgeResponsesWithin2h, 0), dyads.reduce((sum, dyad) => sum + dyad.nudgeSent, 0)))}</strong></article></div><div className={styles.insight}><span>Measurement note</span><p>Responses within two hours are associated with a nudge; they do not prove that the nudge caused the action.</p></div></Panel>
        </div>
      </> : null}

      {view === 'journeys' ? <>
        {selectedDyad && selectedArc ? <>
          <section className={styles.journeyHero}><div><span>{selectedDyad.code}</span><h2>{selectedDyad.name}</h2><p>{selectedDyad.accountMode === 'solo' ? 'Solo account' : 'Shared account'} · Study day {selectedDyad.currentStudyDay} · {selectedDyad.studyPhase}</p></div><div className={styles.journeyStats}><span><small>Captured</small><strong>{selectedDyad.captured}</strong></span><span><small>Completed</small><strong>{selectedDyad.completed}</strong></span><span><small>Active days</small><strong>{selectedDyad.useDaysWeek1 + (selectedDyad.useDaysWeek2 ?? 0)}</strong></span><span><small>Recovery attempts</small><strong>{selectedDyad.attempts}</strong></span></div></section>
          <Panel eyebrow="28-day journey" title="Engagement over time"><div className={styles.timelineBars}>{selectedArc.days.map(day => { const value = signalTotal(day); return <div key={day.day}><i style={{ height: `${Math.max(4, Math.min(100, value * 4))}%` }}><title>{`Day ${day.day}: ${value} signals`}</title></i><span>{day.day}</span></div> })}</div></Panel>
          <div className={styles.equalGrid}><Panel eyebrow="Daily detail" title="Meaningful activity"><div className={styles.dayList}>{selectedArc.days.filter(day => signalTotal(day) > 0).map(day => <article key={day.day}><strong>Day {day.day}</strong><div><span>{day.planLogged} captures</span><span>{day.planCompleted} completions</span><span>{day.smsReplied} replies</span><span>{day.contextViewed} views</span><span>{day.calendarItem} calendar</span></div></article>)}</div></Panel><Panel eyebrow="Research guardrail" title="How to read this journey"><div className={styles.journeyNote}><strong>No private content is shown.</strong><p>This view displays event counts and timing only. Engagement is not automatically benefit, and silence is not automatically failure.</p><p>Use the interview evidence alongside this behavioral timeline.</p></div></Panel></div>
        </> : <div className={styles.emptyState}>No household is available in this scope.</div>}
      </> : null}

      <footer className={styles.footer}><span>Context analytics</span><p>Descriptive evidence, not proof of causation. Validate conclusions with interviews and data-health checks.</p></footer>
    </div>
  </main>
}
