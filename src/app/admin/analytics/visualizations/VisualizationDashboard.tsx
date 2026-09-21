'use client'

import { useMemo, useState } from 'react'

type AnalyticsData = Awaited<ReturnType<typeof import('@/lib/pilot-analytics').loadPilotAnalytics>>
type Dyad = AnalyticsData['perDyad'][number]

function pct(numerator: number, denominator: number) {
  return denominator ? `${Math.round((numerator / denominator) * 100)}%` : '—'
}

function Card({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <article className="viz-card"><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="viz-panel"><div className="viz-heading"><p>{eyebrow}</p><h2>{title}</h2></div>{children}</section>
}

function LineChart({ values, labels, color = '#547a46' }: { values: number[]; labels: string[]; color?: string }) {
  const width = 720
  const height = 230
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * (width - 36) + 18},${height - 28 - (value / max) * (height - 56)}`).join(' ')
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Engagement trend line chart">
    <line x1="18" y1="202" x2="702" y2="202" stroke="#decfaf" />
    <line x1="18" y1="28" x2="18" y2="202" stroke="#decfaf" />
    <polyline points={points} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    {values.map((value, index) => { const [x, y] = points.split(' ')[index].split(','); return <circle key={index} cx={x} cy={y} r="5" fill={color}><title>{`${labels[index]}: ${value}`}</title></circle> })}
    {labels.map((label, index) => index % Math.max(1, Math.ceil(labels.length / 6)) === 0 ? <text key={label} x={(index / Math.max(1, labels.length - 1)) * (width - 36) + 18} y="222" textAnchor="middle" fontSize="12" fill="#746a5b">{label}</text> : null)}
  </svg></div>
}

function Bars({ rows, suffix = '' }: { rows: Array<{ label: string; value: number }>; suffix?: string }) {
  const max = Math.max(1, ...rows.map(row => row.value))
  return <div className="bar-list">{rows.map(row => <div className="bar-row" key={row.label}><div><span>{row.label}</span><strong>{row.value}{suffix}</strong></div><div className="bar-track"><i style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} /></div></div>)}</div>
}

function Funnel({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map(row => row.value))
  return <div className="funnel">{rows.map(row => <div className="funnel-row" key={row.label} style={{ width: `${Math.max(35, (row.value / max) * 100)}%` }}><span>{row.label}</span><strong>{row.value}</strong></div>)}</div>
}

function ActivityHeatmap({ arcs, dyads }: { arcs: AnalyticsData['studyArc']; dyads: Dyad[] }) {
  return <div className="heatmap-wrap"><div className="heatmap-header"><span>Household</span>{Array.from({ length: 28 }, (_, index) => <b key={index}>{index + 1}</b>)}</div>{arcs.filter(arc => dyads.some(dyad => dyad.id === arc.householdId)).map(arc => <div className="heatmap-row" key={arc.householdId}><span title={arc.householdName}>{arc.householdName}</span>{arc.days.map(day => { const activity = day.planLogged + day.planCompleted + day.smsReplied + day.contextViewed + day.calendarItem; return <i key={day.day} className={`heat-${Math.min(4, activity)}`} title={`Day ${day.day}: ${activity} signals`} /> })}</div>)}</div>
}

export default function VisualizationDashboard({ data }: { data: AnalyticsData }) {
  const [selectedHousehold, setSelectedHousehold] = useState('all')
  const dyads = useMemo(() => data.perDyad.filter(dyad => selectedHousehold === 'all' || dyad.id === selectedHousehold), [data.perDyad, selectedHousehold])
  const arcs = data.studyArc
  const activeByDay = Array.from({ length: 28 }, (_, index) => arcs.filter(arc => dyads.some(dyad => dyad.id === arc.householdId) && (arc.days[index]?.planLogged ?? 0) + (arc.days[index]?.planCompleted ?? 0) + (arc.days[index]?.smsReplied ?? 0) + (arc.days[index]?.contextViewed ?? 0) + (arc.days[index]?.calendarItem ?? 0) > 0).length)
  const labels = activeByDay.map((_, index) => `D${index + 1}`)
  const features = data.features.slice(0, 10).map(feature => ({ label: feature.label, value: feature.count }))
  const totalDyads = dyads.length
  const captureTotal = data.capture.saved
  const completionTotal = data.threads.completed
  const outcomeRows = data.outcomeRows.filter(row => dyads.some(dyad => dyad.id === row.householdId))
  const independenceRows = [
    { label: 'Participant-created plans', value: data.independence.mciPlansCreated },
    { label: 'Care-partner-created plans', value: data.independence.cpPlansCreated },
    { label: 'Participant completions', value: data.independence.mciCompletions },
    { label: 'Care-partner completions', value: data.independence.cpCompletions },
  ]
  const journeyDyad = dyads[0]
  const journeyArc = journeyDyad ? arcs.find(arc => arc.householdId === journeyDyad.id) : null

  return <main className="viz-shell">
    <header className="viz-hero"><div><p>Context admin · investor and research view</p><h1>Product signals</h1><span>Visualize the loop from capture to follow-through and independence.</span></div><a href="/admin/analytics">Back to analytics</a></header>
    <section className="viz-scope"><label htmlFor="viz-household">Household detail</label><select id="viz-household" value={selectedHousehold} onChange={event => setSelectedHousehold(event.target.value)}><option value="all">All households</option>{data.perDyad.map(dyad => <option key={dyad.id} value={dyad.id}>{dyad.displayLabel}</option>)}</select><small>Aggregate charts are safe for investor reporting; individual views are for authorized research use.</small></section>

    <section className="viz-kpis"><Card label="Active households" value={totalDyads} note="Current analytics scope" /><Card label="Plans captured" value={captureTotal} note={`${data.capture.saved} saved`} /><Card label="Task completion" value={pct(completionTotal, captureTotal)} note={`${completionTotal} completed threads`} /><Card label="SMS response" value={`${data.sms.promptResponseRate}%`} note={`${data.sms.answeredPrompts} answered prompts`} /><Card label="Participant self-capture" value={data.independence.selfCaptureRate} note="Participant versus CP plan creation" /><Card label="Recovery resumed" value={pct(data.recovery.resumed, data.recovery.attempts)} note={`${data.recovery.resumed} of ${data.recovery.attempts} attempts`} /></section>

    <Section eyebrow="Engagement trend" title="Active households by study day"><p className="viz-caption">A household is active when it produces a meaningful signal: capture, completion, SMS reply, calendar signal, or dashboard use.</p><LineChart values={activeByDay} labels={labels} /></Section>

    <div className="viz-two-col"><Section eyebrow="Retention and persistence" title="Usage by household and day"><ActivityHeatmap arcs={arcs} dyads={dyads} /></Section><Section eyebrow="Feature adoption" title="What people actually use"><Bars rows={features} /></Section></div>

    <div className="viz-two-col"><Section eyebrow="Capture loop" title="Capture quality"><Funnel rows={[{ label: 'Input interpreted', value: data.capture.interpreted }, { label: 'Saved to Context', value: data.capture.saved }, { label: 'Corrected before save', value: data.capture.correctedBeforeSave }, { label: 'Fallback used', value: data.capture.fallbackUsed }]} /></Section><Section eyebrow="Follow-through" title="What happens after capture"><Funnel rows={[{ label: 'Captured threads', value: data.threads.captured }, { label: 'Completed', value: data.threads.completed }, { label: 'Moved or cancelled', value: data.threads.movedOrCancelled }, { label: 'Still unresolved', value: data.threads.startedUnresolved }]} /></Section></div>

    <div className="viz-two-col"><Section eyebrow="Independence" title="Who carries the work"><Bars rows={independenceRows} /></Section><Section eyebrow="Reminder value" title="Nudges and notification burden"><div className="viz-kpi-inline"><Card label="Nudges sent" value={data.nudges.sent} /><Card label="Responses within 2h" value={data.nudges.responsesWithin2h} /><Card label="Response rate" value={data.nudges.responseRate} /><Card label="Average notification load" value={data.nudges.averageLoadPerActiveDay} note="per active day" /></div><Bars rows={[{ label: 'SMS replies', value: data.sms.replied }, { label: 'SMS delivered', value: data.sms.delivered }, { label: 'Push sent', value: data.nudges.pushSent }]} /></Section></div>

    <Section eyebrow="Individual research view" title="Participant journey"><div className="journey-picker"><label htmlFor="journey-household">Choose a household</label><select id="journey-household" value={selectedHousehold === 'all' ? (data.perDyad[0]?.id ?? '') : selectedHousehold} onChange={event => setSelectedHousehold(event.target.value)}>{data.perDyad.map(dyad => <option key={dyad.id} value={dyad.id}>{dyad.displayLabel}</option>)}</select></div>{journeyDyad && journeyArc ? <><p className="viz-caption">{journeyDyad.displayLabel} · study day {journeyDyad.currentStudyDay} · no message or note content is displayed.</p><div className="journey-list">{journeyArc.days.filter(day => day.planLogged + day.planCompleted + day.smsReplied + day.contextViewed + day.calendarItem > 0).map(day => <article key={day.day}><strong>Day {day.day}</strong><span>{day.planLogged} captures · {day.planCompleted} completions · {day.smsReplied} SMS replies · {day.contextViewed} views · {day.calendarItem} calendar</span></article>)}</div></> : <p className="viz-empty">No activity in this scope yet.</p>}</Section>

    <Section eyebrow="Research outcomes" title="Pre/post signals"><div className="outcome-mini">{outcomeRows.length === 0 ? <p className="viz-empty">No outcome scores recorded yet.</p> : outcomeRows.map(row => <article key={row.householdId}><strong>{row.householdName}</strong>{row.scores.map(score => <span key={score.key}>{score.label}: {score.delta === null ? 'not complete' : `${score.delta > 0 ? '+' : ''}${score.delta}`}</span>)}</article>)}</div></Section>
    <footer className="viz-footer">Charts are descriptive signals, not proof of causation. Use the Data health tab before interpreting missing values as zero.</footer>
    <style jsx>{`
      .viz-shell{max-width:1180px;margin:0 auto;padding:32px 22px 80px;color:#2b241b}.viz-hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:22px}.viz-hero p,.viz-heading p{margin:0;color:#6b805d;font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:.72rem}.viz-hero h1{font-family:Georgia,serif;font-size:clamp(2.2rem,5vw,4rem);margin:.25rem 0 .5rem}.viz-hero span{color:#756c5e}.viz-hero a{color:#45673b;font-weight:800;text-decoration:underline}.viz-scope{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#faf6ed;border:1px solid #ead8b6;border-radius:18px;padding:15px 18px;margin-bottom:20px}.viz-scope label,.journey-picker label{font-weight:800}.viz-scope select,.journey-picker select{min-height:44px;border:1px solid #ddceb8;border-radius:10px;background:#fff;padding:0 12px;font:inherit}.viz-scope small{color:#766c5e}.viz-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:20px}.viz-card{background:#fffdfa;border:1px solid #eadcc4;border-radius:16px;padding:16px;min-height:92px;display:flex;flex-direction:column;gap:5px}.viz-card span{font-size:.76rem;color:#776d60;font-weight:700}.viz-card strong{font-size:1.65rem}.viz-card small{color:#867a6a;font-size:.76rem}.viz-panel{background:#fffdfa;border:1px solid #ead8b6;border-radius:22px;padding:22px;margin-bottom:20px;box-shadow:0 10px 28px rgba(44,35,24,.05)}.viz-heading{margin-bottom:13px}.viz-heading h2{font-family:Georgia,serif;font-size:1.55rem;margin:.25rem 0}.viz-caption{color:#766c5e;margin:0 0 10px}.chart-wrap{width:100%;overflow:hidden}.chart-wrap svg{width:100%;min-height:210px}.viz-two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}.bar-list{display:grid;gap:14px}.bar-row>div:first-child{display:flex;justify-content:space-between;gap:12px;margin-bottom:6px}.bar-row span{font-weight:700}.bar-row strong{color:#657d57}.bar-track{height:12px;border-radius:99px;background:#efe5d4;overflow:hidden}.bar-track i{display:block;height:100%;border-radius:inherit;background:#719261}.funnel{display:grid;gap:7px;align-items:center}.funnel-row{background:#dfead9;color:#274422;min-height:42px;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;gap:12px;margin:auto}.funnel-row:nth-child(2){background:#cbdcc2}.funnel-row:nth-child(3){background:#b7d0ab}.funnel-row:nth-child(4){background:#9fbe91}.heatmap-wrap{overflow-x:auto}.heatmap-header,.heatmap-row{display:grid;grid-template-columns:145px repeat(28,18px);gap:4px;align-items:center;min-width:790px;margin-bottom:6px}.heatmap-header{color:#867a6a;font-size:.66rem;text-align:center}.heatmap-header span,.heatmap-row>span{text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.heatmap-row>span{font-size:.78rem;font-weight:800}.heatmap-row i{display:block;width:18px;height:18px;border-radius:4px;background:#f0e8dc}.heatmap-row .heat-1{background:#dce8d6}.heatmap-row .heat-2{background:#b9d1ae}.heatmap-row .heat-3{background:#87aa78}.heatmap-row .heat-4{background:#547a46}.viz-kpi-inline{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.viz-kpi-inline .viz-card{min-height:78px}.journey-picker{display:flex;align-items:center;gap:12px;margin-bottom:10px}.journey-list{display:grid;gap:8px}.journey-list article,.outcome-mini article{display:flex;gap:15px;align-items:center;border-top:1px solid #eee2d1;padding:11px 0}.journey-list article span,.outcome-mini article span{color:#756c5e}.outcome-mini{display:grid;gap:4px}.outcome-mini article{flex-wrap:wrap}.outcome-mini article strong{min-width:180px}.viz-empty{color:#817566}.viz-footer{color:#857969;font-size:.82rem;margin-top:5px}@media(max-width:900px){.viz-kpis{grid-template-columns:repeat(3,1fr)}.viz-two-col{grid-template-columns:1fr}}@media(max-width:560px){.viz-shell{padding:22px 14px 60px}.viz-hero{align-items:flex-start;flex-direction:column}.viz-kpis{grid-template-columns:repeat(2,1fr)}.viz-kpi-inline{grid-template-columns:repeat(2,1fr)}.viz-card strong{font-size:1.35rem}.journey-picker{align-items:flex-start;flex-direction:column}}
    `}</style>
  </main>
}
