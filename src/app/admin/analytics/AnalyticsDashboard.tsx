'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'

type AnalyticsData = Awaited<ReturnType<typeof import('@/lib/pilot-analytics').loadPilotAnalytics>>
type Dyad = AnalyticsData['perDyad'][number]
type Episode = AnalyticsData['queryLog'][number]
type TabKey = 'dyad' | 'roster' | 'queries' | 'threads' | 'modality' | 'partner' | 'sms' | 'persist' | 'disconf'
type Provenance = 'obs' | 'inf' | 'rep'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'dyad', label: 'Dyad' },
  { key: 'roster', label: 'Roster' },
  { key: 'queries', label: 'Query log' },
  { key: 'threads', label: 'Threads' },
  { key: 'modality', label: 'Modality' },
  { key: 'partner', label: 'Care partner' },
  { key: 'sms', label: 'SMS' },
  { key: 'persist', label: 'Persistence' },
  { key: 'disconf', label: 'Disconfirmation' },
]

function fmtDate(value: string | null | undefined) {
  if (!value) return 'Not instrumented'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function pct(numerator: number, denominator: number) {
  if (denominator === 0) return '0'
  if (denominator < 5) return `${numerator}/${denominator}`
  return `${Math.round((numerator / denominator) * 100)}%`
}

function fmtMaybe(value: number | string | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
}

function dyadName(dyad: Pick<Dyad, 'code' | 'label'>) {
  return `${dyad.code} · ${dyad.label}`
}

function outcomeLabel(outcome: string) {
  const labels: Record<string, string> = {
    resolved: 'resumed after result',
    unresolved_after_result: 'no resumption after result',
    rank_failure: 'relevant context ranked low',
    no_context: 'nothing relevant held',
    pending: 'window still open',
  }
  return labels[outcome] ?? outcome.replaceAll('_', ' ')
}

function outcomeTag(outcome: string) {
  if (outcome === 'resolved') return 't-obs'
  if (outcome === 'pending') return 't-mute'
  return 't-alert'
}

function Kpi({ label, value, sub, provenance }: { label: string; value: string | number; sub: string; provenance: Provenance }) {
  return (
    <div className="card sm">
      <div className="k"><span className={`pv p-${provenance}`}>{provenance}</span>{label}</div>
      <div className="v">{value}</div>
      <div className="vsub">{sub}</div>
    </div>
  )
}

function Bar({ label, value, total, tone }: { label: string; value: number; total: number; tone?: 'g' | 'r' }) {
  const width = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="brow">
      <div>{label}</div>
      <div className="bar"><span className={tone ?? ''} style={{ width: `${width}%` }} /></div>
      <div className="n">{value}</div>
    </div>
  )
}

function Ladder({ rows }: { rows: Array<{ title: string; sub: string; value: string | number }> }) {
  return (
    <div className="ladder">
      {rows.map(row => (
        <div className="r" key={row.title}>
          <div><b>{row.title}</b><small>{row.sub}</small></div>
          <div className="n">{row.value}</div>
        </div>
      ))}
    </div>
  )
}

function Spark({ values, tone = 'inf' }: { values: number[]; tone?: 'inf' | 'rep' }) {
  if (values.length === 0) return <span className="hint">—</span>
  const width = 76
  const height = 16
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width
    const y = height - (value / max) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><polyline fill="none" stroke={`var(--${tone})`} strokeWidth="1.2" points={points} /></svg>
}

function EmptyRow({ colSpan, text = 'Not instrumented' }: { colSpan: number; text?: string }) {
  return <tr><td colSpan={colSpan} className="hint">{text}</td></tr>
}

function Track({ dyad, episodes, unresolved }: { dyad: Dyad; episodes: Episode[]; unresolved: AnalyticsData['recovery']['startedUnresolved'] }) {
  return (
    <div className="track">
      <span className="clean" style={{ left: `${(11 / 14) * 100}%`, right: `${(1 / 14) * 100}%` }} />
      <span className="wk" style={{ left: '50%' }} />
      <span className="now" style={{ left: `${Math.min(100, (dyad.currentStudyDay / 14) * 100)}%` }} />
      {episodes.map(episode => {
        const left = `${Math.min(100, Math.max(0, (episode.t / 14) * 100))}%`
        const cls = episode.outcome === 'resolved' ? 'res' : episode.outcome === 'no_context' ? 'nores' : episode.outcome === 'pending' ? 'pend' : 'unres'
        return <i aria-hidden="true" className={`ep ${cls}`} key={episode.id} style={{ left }} title={`Day ${episode.day} · ${episode.query}`} />
      })}
      {unresolved.map(thread => (
        <i aria-hidden="true" className="ep unre" key={thread.id} style={{ left: `${Math.min(100, Math.max(0, (thread.t / 14) * 100))}%` }} title={`Started, unresolved: ${thread.title}`} />
      ))}
    </div>
  )
}

function ScopeBar({
  data,
  cohort,
  setCohort,
  selected,
  setSelected,
  setCurrentCode,
  setTab,
}: {
  data: AnalyticsData
  cohort: string
  setCohort: (value: string) => void
  selected: Set<string>
  setSelected: (value: Set<string>) => void
  setCurrentCode: (value: string) => void
  setTab: (value: TabKey) => void
}) {
  const dyads = data.perDyad.filter(dyad => dyad.cohort === cohort)
  const selectedCount = dyads.filter(dyad => selected.has(dyad.code)).length
  const flagCount = dyads.reduce((sum, dyad) => sum + dyad.flagCount, 0)
  function selectCodes(codes: string[]) {
    setSelected(new Set(codes))
    setCurrentCode(codes[0] ?? dyads[0]?.code ?? '')
    setTab('dyad')
  }
  return (
    <div className="scope">
      <div className="grp"><label htmlFor="cohort">Cohort</label>
        <select id="cohort" value={cohort} onChange={event => {
          const next = event.target.value
          const nextDyads = data.perDyad.filter(dyad => dyad.cohort === next)
          setCohort(next)
          setSelected(new Set(nextDyads.map(dyad => dyad.code)))
          setCurrentCode(nextDyads[0]?.code ?? '')
          setTab('dyad')
        }}>
          {data.cohorts.map(item => <option value={item.id} key={item.id}>{item.label} · {item.count}</option>)}
        </select>
      </div>
      <div className="grp"><label>Dyads</label>
        <button className="ctl" type="button" onClick={() => selectCodes(dyads.map(dyad => dyad.code))}>All</button>
        <button className="ctl" type="button" onClick={() => selectCodes([])}>None</button>
        <button className="ctl" type="button" aria-pressed={selectedCount > 0 && dyads.filter(dyad => selected.has(dyad.code)).every(dyad => dyad.flagCount > 0)} onClick={() => selectCodes(dyads.filter(dyad => dyad.flagCount > 0).map(dyad => dyad.code))}>Needs attention</button>
      </div>
      <div className="chips">
        {dyads.map(dyad => (
          <button className="chip" type="button" key={dyad.code} aria-pressed={selected.has(dyad.code)} onClick={() => {
            const next = new Set(selected)
            if (next.has(dyad.code)) next.delete(dyad.code)
            else next.add(dyad.code)
            setSelected(next)
            setCurrentCode(dyad.code)
          }}>{dyadName(dyad)}{dyad.flagCount ? ` ·${dyad.flagCount}` : ''}</button>
        ))}
      </div>
      <span className="n">{selectedCount} of {dyads.length} selected · {flagCount} flags in cohort</span>
    </div>
  )
}

function DyadPage({ dyad, data }: { dyad: Dyad | undefined; data: AnalyticsData }) {
  if (!dyad) return <p className="hint">No dyad selected.</p>
  const episodes = data.queryLog.filter(episode => episode.householdId === dyad.id)
  const unresolved = data.recovery.startedUnresolved.filter(thread => thread.householdId === dyad.id)
  const recent = episodes.slice(0, 5)
  const captureTotal = dyad.captured || 1
  const retrievalTotal = Math.max(1, dyad.attempts)
  return (
    <>
      <div className="dyad-title">
        <h2 className="sec first">{dyadName(dyad)}</h2>
        <span className="hint">{dyad.withdrawn ? <span className="tag t-alert">withdrawn</span> : `day ${dyad.currentStudyDay} of 14`} · last meaningful use {dyad.daysDark ? `${dyad.daysDark} days ago` : 'today'} · {dyad.attempts} recovery attempts</span>
      </div>
      <p className="lede">Everything for one pair on one page. This is the unit of analysis: read it beside the transcript, not against the cohort.</p>
      <h3 className="sub">Ask about this</h3>
      <p className="lede">Derived from telemetry. Not findings. Interview prompts, with the evidence attached so you can put the question in your own words.</p>
      <div className="flags">
        <div className="fh">{dyad.flagCount} prompt{dyad.flagCount === 1 ? '' : 's'} for the next conversation</div>
        {dyad.flags.length ? dyad.flags.map(flag => (
          <div className="f" key={flag.question}>
            <div><div className="ask">{flag.question}</div><div className="ev">{flag.evidence}</div></div>
            <div className="src">{flag.source}</div>
          </div>
        )) : <div className="none">Nothing flagged. Telemetry looks unremarkable for this dyad, which is itself worth a sentence in the notes.</div>}
      </div>
      <div className="grid c4 top-grid">
        <Kpi label="Attempts" value={dyad.attempts} sub="recovery queries" provenance="obs" />
        <Kpi label="Resumed after" value={dyad.resumed} sub="app-observed sequence" provenance="obs" />
        <Kpi label="Corroborated" value={episodes.filter(episode => episode.reported === 'got going again').length} sub="participant said so" provenance="rep" />
        <Kpi label="Nothing held" value={dyad.nothingHeld} sub="query, no candidates" provenance="obs" />
      </div>
      <div className="grid c4 top-grid">
        <Kpi label="Captured" value={dyad.captured} sub={`${dyad.completed} completed`} provenance="obs" />
        <Kpi label="Started, unresolved" value={dyad.unresolved} sub="no terminal event" provenance="obs" />
        <Kpi label="Reflections" value={dyad.reflectionsSaved} sub={`${dyad.reflectionUsed} surfaced in a break`} provenance="obs" />
        <Kpi label="SMS replies" value={dyad.smsReplied} sub={`of ${dyad.smsDelivered} delivered`} provenance="obs" />
      </div>
      <h3 className="sub">Fourteen days</h3>
      <div className="strip-head"><div>Measure</div><div>Day 1 to 14</div><div className="right">Wk1 to Wk2</div></div>
      <div className="strip-row static"><div className="dyad">Recovery<small>episodes</small></div><Track dyad={dyad} episodes={episodes} unresolved={unresolved} /><div className="tally"><b>{dyad.resumed}</b> resumed · {dyad.attempts} attempts</div></div>
      <div className="strip-row static"><div className="dyad">Captures<small>per day</small></div><Spark values={dyad.useTrend} /><div className="tally">{dyad.capturesWeek1} to {fmtMaybe(dyad.capturesWeek2)}</div></div>
      <div className="strip-row static"><div className="dyad">Care partner<small>opens per day</small></div><Spark values={dyad.cpOpenTrend} tone="rep" /><div className="tally">{dyad.week1CpOpensPerDay.toFixed(1)} to {typeof dyad.week2CpOpensPerDay === 'number' ? dyad.week2CpOpensPerDay.toFixed(1) : '—'}</div></div>
      <Legend />
      <h3 className="sub">Recent episodes</h3>
      {recent.length ? recent.map(episode => <EpisodeChain episode={episode} key={episode.id} />) : <p className="hint">No recovery attempts recorded.</p>}
      <div className="grid c2 top-grid">
        <div className="card"><div className="k">How they capture</div><div className="bars">
          <Bar label="captured threads" value={dyad.captured} total={captureTotal} />
          <Bar label="completed" value={dyad.completed} total={captureTotal} tone="g" />
          <Bar label="abandoned" value={dyad.abandoned} total={Math.max(captureTotal, dyad.abandoned)} tone="r" />
        </div></div>
        <div className="card"><div className="k">How they retrieve when stuck</div><div className="bars">
          <Bar label="attempts" value={dyad.attempts} total={retrievalTotal} />
          <Bar label="resumed" value={dyad.resumed} total={retrievalTotal} tone="g" />
          <Bar label="nothing held" value={dyad.nothingHeld} total={retrievalTotal} tone="r" />
          <div className="hint space">SMS is not a retrieval path.</div>
        </div></div>
      </div>
      <h3 className="sub">Care partner, reported</h3>
      <table><thead><tr><th>Day 7: reminding</th><th>Day 7: extra checking</th><th>Day 14: stopped doing</th><th>Day 14: still did unchanged</th></tr></thead><tbody><tr><td className="hint">pending</td><td className="hint">pending</td><td className="hint">pending exit</td><td className="hint">pending exit</td></tr></tbody></table>
      <div className="note">Offload is not visible in telemetry. The care partner views in Context and does not act in it, so the reported row carries this claim.</div>
    </>
  )
}

function EpisodeChain({ episode }: { episode: Episode }) {
  return (
    <div className="chain">
      <div className="line"><span className="b">day {episode.day}</span><em>to</em><span className="b">{episode.mode}{episode.switched ? ' after abandoned voice' : ''}</span><em>to</em><span className="q">"{episode.query}"</span></div>
      <div className="line"><em>to</em><span className="b">{episode.candidateCount ?? 'Not instrumented'} candidates</span><em>to</em><span className="b">{episode.selectedRank ? `selected rank ${episode.selectedRank}, from ${episode.selectedSource}` : 'nothing selected'}</span><em>to</em><span className="b">{episode.resumed ? 'thread resumed' : 'no resumption observed'}</span><span className={`tag ${outcomeTag(episode.outcome)}`}>{outcomeLabel(episode.outcome)}</span></div>
      {episode.candidates.length > 0 && <div className="rank">Context Rank returned:<ol>{episode.candidates.map(candidate => <li className={candidate === episode.selectedLabel ? 'sel' : ''} key={candidate}>{candidate}{candidate === episode.selectedLabel ? ' selected' : ''}</li>)}</ol></div>}
      {episode.reported ? <div className="rank"><span className="pv p-rep">Reported</span>participant said: "{episode.reported}"</div> : <div className="rank"><span className="pv p-none">No report</span>event prompt not answered. Independence uncorroborated.</div>}
    </div>
  )
}

function Legend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--obs)' }} />Resumed</span>
      <span><i className="hollow" />Result, no resumption</span>
      <span><i style={{ background: 'var(--alert)' }} />Nothing held</span>
      <span><i style={{ background: 'var(--ink-30)' }} />Window still open</span>
      <span><i className="sq" />Started, unresolved</span>
      <span>Vertical grey rule marks that dyad's current day</span>
    </div>
  )
}

function RosterTab({ dyads, data, openDyad }: { dyads: Dyad[]; data: AnalyticsData; openDyad: (code: string) => void }) {
  const [sortBy, setSortBy] = useState('code')
  const sorted = useMemo(() => [...dyads].sort((a, b) => {
    if (sortBy === 'flags') return b.flagCount - a.flagCount
    if (sortBy === 'attempts') return b.attempts - a.attempts
    if (sortBy === 'resumed') return b.resumed - a.resumed
    if (sortBy === 'open') return b.unresolved - a.unresolved
    if (sortBy === 'last') return b.daysDark - a.daysDark
    return a.code.localeCompare(b.code)
  }), [dyads, sortBy])
  return (
    <>
      <div className="grid c4 top-grid">
        <Kpi label="Median attempts" value={data.recovery.medianAttempts} sub="per dyad in scope" provenance="obs" />
        <Kpi label="Median resumed" value={data.recovery.medianResumed} sub="app-observed" provenance="obs" />
        <Kpi label="Median captures" value={data.recovery.medianCaptures} sub="per dyad" provenance="obs" />
        <Kpi label="Dyads flagged" value={`${dyads.filter(dyad => dyad.flagCount > 0).length} of ${dyads.length}`} sub="have interview prompts" provenance="inf" />
      </div>
      <h2 className="sec">Roster</h2>
      <p className="lede">Medians, not sums. Dyads sit at different study days, so a total across them is not a quantity that means anything. Select a row to open that dyad.</p>
      <div className="strip-head"><div><button className="srt" onClick={() => setSortBy('code')} type="button">Dyad</button></div><div>Day 1 to 14</div><div className="right"><button className="srt" onClick={() => setSortBy('attempts')} type="button">Tally</button></div></div>
      {sorted.map(dyad => <button className="strip-row" type="button" key={dyad.code} onClick={() => openDyad(dyad.code)}><div className="dyad">{dyadName(dyad)}<small>{dyad.withdrawn ? 'withdrawn' : `day ${dyad.currentStudyDay}`}{dyad.flagCount ? ` · ${dyad.flagCount} flags` : ''}</small></div><Track dyad={dyad} episodes={data.queryLog.filter(episode => episode.householdId === dyad.id)} unresolved={data.recovery.startedUnresolved.filter(thread => thread.householdId === dyad.id)} /><div className="tally"><b>{dyad.resumed}</b> resumed · {dyad.attempts} attempts · {dyad.unresolved} open</div></button>)}
      <Legend />
      <h2 className="sec">Per dyad</h2>
      <table><thead><tr><th><button className="srt" onClick={() => setSortBy('code')} type="button">Dyad</button></th><th className="num">Day</th><th className="num"><button className="srt" onClick={() => setSortBy('attempts')} type="button">Attempts</button></th><th className="num"><button className="srt" onClick={() => setSortBy('resumed')} type="button">Resumed</button></th><th className="num">Nothing held</th><th className="num">Captured</th><th className="num"><button className="srt" onClick={() => setSortBy('open')} type="button">Open</button></th><th>Use trend</th><th className="num"><button className="srt" onClick={() => setSortBy('last')} type="button">Days dark</button></th><th className="num"><button className="srt" onClick={() => setSortBy('flags')} type="button">Flags</button></th></tr></thead><tbody>
        {sorted.length === 0 ? <EmptyRow colSpan={10} text="No dyads in scope." /> : sorted.map(dyad => <tr className="click" onClick={() => openDyad(dyad.code)} key={dyad.code}><td>{dyadName(dyad)}</td><td className="num">{dyad.currentStudyDay}</td><td className="num">{dyad.attempts}</td><td className="num">{dyad.resumed}</td><td className="num">{dyad.nothingHeld}</td><td className="num">{dyad.captured}</td><td className="num">{dyad.unresolved}</td><td><Spark values={dyad.useTrend} /></td><td className="num">{dyad.daysDark}</td><td className="num">{dyad.flagCount ? <span className="tag t-alert">{dyad.flagCount}</span> : '—'}</td></tr>)}
      </tbody></table>
      <h2 className="sec">Contrast</h2>
      <div className="cmp"><div><div className="k">Most resumptions in scope</div><div className="v">{sorted.filter(d => d.resumed > 0).sort((a, b) => b.resumed - a.resumed).slice(0, 3).map(d => d.label).join(', ') || '—'}</div><div className="vsub">Read their queries first.</div></div><div><div className="k">No resumption observed</div><div className="v">{sorted.filter(d => d.resumed === 0).slice(0, 4).map(d => d.label).join(', ') || '—'}</div><div className="vsub">Then read theirs. The difference is the finding.</div></div></div>
    </>
  )
}

function QueriesTab({ rows, dyads, data, openDyad }: { rows: Episode[]; dyads: Dyad[]; data: AnalyticsData; openDyad: (code: string) => void }) {
  const [filter, setFilter] = useState('all')
  const filtered = rows.filter(row => filter === 'all' || row.outcome === filter)
  const count = (outcome: string) => rows.filter(row => row.outcome === outcome).length
  return (
    <>
      <h2 className="sec first">Query log</h2>
      <p className="lede">The highest-value artifact the study produces. Every string a participant typed or spoke, verbatim. Select a row to open that dyad.</p>
      <div className="filters"><span className="k">Outcome</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All {rows.length}</option><option value="no_context">Nothing held ({count('no_context')})</option><option value="rank_failure">Ranked low ({count('rank_failure')})</option><option value="unresolved_after_result">No resumption ({count('unresolved_after_result')})</option><option value="resolved">Resumed ({count('resolved')})</option><option value="pending">Window open ({count('pending')})</option></select><a className="export" href={`/api/admin/analytics/export?dataset=queries&days=${data.filters.days}`}>Export CSV</a><span className="k restricted">Restricted column · named in consent</span></div>
      <table><thead><tr><th>Dyad</th><th className="num">Day</th><th>Query, verbatim</th><th>Mode</th><th className="num">Cand.</th><th>Selected</th><th>Thread</th><th>Report</th><th>Outcome</th></tr></thead><tbody>
        {filtered.length === 0 ? <EmptyRow colSpan={9} text="No queries in scope." /> : filtered.map(row => <tr className="click" onClick={() => openDyad(row.code)} key={row.id}><td>{dyadName(dyads.find(dyad => dyad.code === row.code) ?? { code: row.code, label: 'Unknown' })}</td><td className="num">{row.day}</td><td className="q">"{row.query}"</td><td><span className="tag t-inf">{row.mode}</span></td><td className="num">{row.candidateCount ?? '—'}</td><td>{row.selectedRank ? `#${row.selectedRank} · ${row.selectedSource}` : '—'}</td><td>{row.resumed ? 'resumed' : '—'}</td><td>{row.reported ? <span className="tag t-rep">{row.reported}</span> : <span className="tag t-mute">no report</span>}</td><td><span className={`tag ${outcomeTag(row.outcome)}`}>{outcomeLabel(row.outcome)}</span></td></tr>)}
      </tbody></table>
      <div className="note">Context Rank lives in this table and the dyad page: candidate count plus rank position separates Context did not know it from Context knew it and buried it.</div>
    </>
  )
}

function ThreadsTab({ data, dyads, openDyad }: { data: AnalyticsData; dyads: Dyad[]; openDyad: (code: string) => void }) {
  return (
    <>
      <div className="grid c4 top-grid"><Kpi label="Captured" value={data.threads.captured} sub={`${dyads.length} dyads in scope`} provenance="obs" /><Kpi label="Completed" value={data.threads.completed} sub={`${pct(data.threads.completed, data.threads.captured)} of captured`} provenance="obs" /><Kpi label="Moved or cancelled" value={data.threads.movedOrCancelled} sub="deliberate change" provenance="obs" /><Kpi label="Started, unresolved" value={data.threads.startedUnresolved} sub="no terminal event" provenance="obs" /></div>
      <h2 className="sec">Capture states</h2>
      <Ladder rows={[{ title: 'Captured successfully', sub: 'Activity created and persisted, any modality.', value: data.threads.captured }, { title: 'Capture initiated, abandoned', sub: 'Input opened, nothing submitted.', value: data.threads.captureAbandoned }, { title: 'Prompt delivered, no response', sub: 'Text reached the phone, no reply.', value: data.threads.promptNoResponse }, { title: 'Captured, later resolved', sub: 'Completed, moved, or cancelled.', value: data.threads.capturedLaterResolved }, { title: 'Captured, later unresolved', sub: 'Classification as a dropped thread requires corroborating evidence.', value: data.threads.capturedLaterUnresolved }]} />
      <h2 className="sec">Retrieval outcomes</h2>
      <Ladder rows={[{ title: 'Resolved', sub: 'Result selected, thread resumed within the window.', value: data.threads.retrievalResolved }, { title: 'Unresolved after result', sub: 'Context answered. Nothing followed.', value: data.threads.retrievalUnresolvedAfterResult }, { title: 'Ranking failure', sub: 'Relevant context returned below the selection point.', value: data.threads.retrievalRankFailure }, { title: 'No context held', sub: 'Nothing relevant existed. The query text is the artifact.', value: data.threads.retrievalNoContext }, { title: 'Window still open', sub: 'Too recent to classify. Excluded from failure counts.', value: data.recovery.pending }]} />
      <h2 className="sec">Per dyad</h2>
      <table><thead><tr><th>Dyad</th><th className="num">Captured</th><th className="num">Abandoned</th><th className="num">Completed</th><th className="num">Unresolved</th><th className="num">Attempts</th><th className="num">Resumed</th><th className="num">Nothing held</th></tr></thead><tbody>{dyads.length === 0 ? <EmptyRow colSpan={8} /> : dyads.map(dyad => <tr className="click" onClick={() => openDyad(dyad.code)} key={dyad.code}><td>{dyadName(dyad)}</td><td className="num">{dyad.captured}</td><td className="num">{dyad.abandoned}</td><td className="num">{dyad.completed}</td><td className="num">{dyad.unresolved}</td><td className="num">{dyad.attempts}</td><td className="num">{dyad.resumed}</td><td className="num">{dyad.nothingHeld}</td></tr>)}</tbody></table>
    </>
  )
}

function ModalityTab({ data, dyads, openDyad }: { data: AnalyticsData; dyads: Dyad[]; openDyad: (code: string) => void }) {
  const captureTotal = Object.values(data.modality.captureModes).reduce((sum, value) => sum + value, 0)
  const retrievalTotal = Object.values(data.modality.retrievalModes).reduce((sum, value) => sum + value, 0)
  return (
    <>
      <div className="grid c4 top-grid"><Kpi label="Voice completion" value={pct(data.modality.voiceSaved, data.modality.voiceStarted)} sub={`${data.modality.voiceSaved} of ${data.modality.voiceStarted} started`} provenance="obs" /><Kpi label="Modality switches" value={data.modality.switches} sub="abandoned one, finished in another" provenance="obs" /><Kpi label="Reflection completion" value={pct(data.modality.reflectionSaved, data.modality.reflectionStarted)} sub={`${data.modality.reflectionSaved} of ${data.modality.reflectionStarted} started`} provenance="obs" /><Kpi label="Reflection to retrieval" value={data.modality.reflectionUsed} sub="selected source" provenance="obs" /></div>
      <h2 className="sec">Capture versus retrieval</h2>
      <div className="grid c2"><div className="card"><div className="k">How they capture</div><div className="bars">{(['voice', 'typed', 'tap', 'sms'] as const).map(mode => <Bar key={mode} label={mode} value={data.modality.captureModes[mode]} total={captureTotal} />)}</div></div><div className="card"><div className="k">How they retrieve when stuck</div><div className="bars">{(['voice', 'typed', 'tap'] as const).map(mode => <Bar key={mode} label={mode} value={data.modality.retrievalModes[mode]} total={retrievalTotal} />)}<div className="hint space">SMS is not a retrieval path in this build.</div></div></div></div>
      <h2 className="sec">Per dyad</h2>
      <table><thead><tr><th>Dyad</th><th className="num">Voice cap.</th><th className="num">Typed</th><th className="num">Tap</th><th className="num">SMS</th><th className="num">Refl. saved</th><th className="num">Refl. used</th></tr></thead><tbody>{dyads.length === 0 ? <EmptyRow colSpan={7} /> : dyads.map(dyad => <tr className="click" onClick={() => openDyad(dyad.code)} key={dyad.code}><td>{dyadName(dyad)}</td><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">{dyad.smsReplied}</td><td className="num">{dyad.reflectionsSaved}</td><td className="num">{dyad.reflectionUsed}</td></tr>)}</tbody></table>
    </>
  )
}

function PartnerTab({ dyads, openDyad }: { dyads: Dyad[]; openDyad: (code: string) => void }) {
  return (
    <>
      <h2 className="sec first">Visibility, not intervention</h2>
      <p className="lede">The care partner views in Context; they do not act in it. The left columns are checking behaviour. Offload is carried entirely by the reported columns.</p>
      <table><thead><tr><th>Dyad</th><th className="num">Wk1 opens/day</th><th className="num">Wk2 opens/day</th><th>Trend</th><th>Day 7: reminding<span className="pv p-rep inline">rep</span></th><th>Day 7: extra checking<span className="pv p-rep inline">rep</span></th><th>Day 14 pair</th></tr></thead><tbody>{dyads.length === 0 ? <EmptyRow colSpan={7} /> : dyads.map(dyad => <tr className="click" onClick={() => openDyad(dyad.code)} key={dyad.code}><td>{dyadName(dyad)}</td><td className="num">{dyad.week1CpOpensPerDay.toFixed(1)}</td><td className="num">{typeof dyad.week2CpOpensPerDay === 'number' ? dyad.week2CpOpensPerDay.toFixed(1) : '—'}</td><td><Spark values={dyad.cpOpenTrend} tone="rep" /></td><td className="hint">pending</td><td className="hint">pending</td><td className="hint">pending exit</td></tr>)}</tbody></table>
    </>
  )
}

function SmsTab({ data, dyads, openDyad }: { data: AnalyticsData; dyads: Dyad[]; openDyad: (code: string) => void }) {
  return (
    <>
      <div className="grid c4 top-grid"><Kpi label="Sent" value={data.sms.sent} sub="morning prompts" provenance="obs" /><Kpi label="Delivered" value={data.sms.delivered} sub={`${pct(data.sms.delivered, data.sms.sent)} · Twilio callback`} provenance="obs" /><Kpi label="Replied" value={data.sms.replied} sub={`${pct(data.sms.replied, data.sms.delivered)} of delivered`} provenance="obs" /><Kpi label="Reply used" value={data.sms.parsed} sub="created or updated a thread" provenance="obs" /></div>
      <h2 className="sec">Lifecycle</h2>
      <Ladder rows={[{ title: 'Sent', sub: 'Scheduled and dispatched.', value: data.sms.sent }, { title: 'Delivered', sub: 'Carrier receipt.', value: data.sms.delivered }, { title: 'Delivered, no reply', sub: 'Not a failure on its own.', value: data.sms.deliveredNoReply }, { title: 'Replied', sub: 'Inbound message received.', value: data.sms.replied }, { title: 'Reply created or updated a thread', sub: 'The round trip landed in Context.', value: data.sms.parsed }, { title: 'Replied, not usable', sub: 'Received but not parsed or acted on.', value: data.sms.notUsable }]} />
      <h2 className="sec">Per dyad</h2>
      <table><thead><tr><th>Dyad</th><th className="num">Sent</th><th className="num">Delivered</th><th className="num">Replied</th><th className="num">Rate</th><th className="num">Median latency</th><th className="num">Landed</th></tr></thead><tbody>{dyads.length === 0 ? <EmptyRow colSpan={7} /> : dyads.map(dyad => <tr className="click" onClick={() => openDyad(dyad.code)} key={dyad.code}><td>{dyadName(dyad)}</td><td className="num">{dyad.smsSent}</td><td className="num">{dyad.smsDelivered}</td><td className="num">{dyad.smsReplied}</td><td className="num">{pct(dyad.smsReplied, dyad.smsDelivered)}</td><td className="num">{dyad.smsMedianLatency ? `${dyad.smsMedianLatency} min` : '—'}</td><td className="num">{dyad.smsParsed}</td></tr>)}</tbody></table>
      <div className="note">Open rate is unavailable for ordinary SMS. Delivery receipts and inbound replies are the defensible signals.</div>
    </>
  )
}

function PersistenceTab({ data, dyads, openDyad }: { data: AnalyticsData; dyads: Dyad[]; openDyad: (code: string) => void }) {
  return (
    <>
      <div className="grid c3 top-grid"><Kpi label="Meaningful-use days" value={`${data.persistence.useDaysWeek1} to ${fmtMaybe(data.persistence.useDaysWeek2)}`} sub="week 1 to week 2" provenance="obs" /><Kpi label="Attempts in clean window" value={data.persistence.cleanWindowAttempts} sub="days 12 to 13" provenance="obs" /><Kpi label="Active in week 2" value={`${data.persistence.activeWeek2Dyads} of ${dyads.filter(d => d.currentStudyDay > 7).length}`} sub="of those who reached week 2" provenance="obs" /></div>
      <h2 className="sec">Meaningful use</h2>
      <p className="lede">A day counts if at least one substantive event occurred. Week 2 columns divide by days actually elapsed. A dyad on day 5 shows a dash, not zero.</p>
      <table><thead><tr><th>Dyad</th><th className="num">Day</th><th className="num">Use days</th><th className="num">Captures</th><th className="num">Attempts</th><th className="num">Reflections</th><th className="num">CP opens/day</th><th className="num">Clean window</th></tr></thead><tbody>{dyads.length === 0 ? <EmptyRow colSpan={8} /> : dyads.map(dyad => <tr className="click" onClick={() => openDyad(dyad.code)} key={dyad.code}><td>{dyadName(dyad)}</td><td className="num">{dyad.currentStudyDay}</td><td className="num">{dyad.useDaysWeek1} to {fmtMaybe(dyad.useDaysWeek2)}</td><td className="num">{dyad.capturesWeek1} to {fmtMaybe(dyad.capturesWeek2)}</td><td className="num">{dyad.attemptsWeek1} to {fmtMaybe(dyad.attemptsWeek2)}</td><td className="num">{dyad.reflectionsWeek1} to {fmtMaybe(dyad.reflectionsWeek2)}</td><td className="num">{dyad.week1CpOpensPerDay.toFixed(1)} to {typeof dyad.week2CpOpensPerDay === 'number' ? dyad.week2CpOpensPerDay.toFixed(1) : '—'}</td><td className="num">{dyad.currentStudyDay > 11 ? dyad.cleanWindowAttempts : '—'}</td></tr>)}</tbody></table>
    </>
  )
}

function DisconfirmationTab({ data }: { data: AnalyticsData }) {
  const rows = [
    ['No participant with MCI shows a corroborated independent recovery', `${data.disconfirmation.corroboratedDyads} dyads have at least one observed and corroborated recovery. ${data.disconfirmation.observedResumptions} episodes show app-observed resumption.`],
    ['Care partners keep doing their previous work while Context adds checking', `${data.disconfirmation.risingNoDrop} dyads show rising dashboard opens without a reported drop. Day 14 evidence pending.`],
    ['Use occurs around researcher contact and does not persist', `${data.disconfirmation.attemptsNearContact} attempts fall near scheduled contact. ${data.disconfirmation.cleanWindowAttempts} fall in the clean window.`],
    ['Dyadic privacy requirements conflict with no resolving configuration', 'Not derivable from telemetry. Coded from baseline, joint sharing, and day 14 questions.'],
  ]
  return (
    <>
      <h2 className="sec first">Predefined disconfirmation</h2>
      <p className="lede">Written into the protocol before enrollment. No verdicts and no cutoffs: the panel shows evidence for the dyads currently in scope; the researcher makes the call.</p>
      <div className="dis">{rows.map((row, index) => <div className="row" key={row[0]}><div className="idx">{String.fromCharCode(65 + index)}</div><div className="txt">{row[0]}<small>{row[1]}</small></div><div className="st">Researcher<br />interpretation</div></div>)}</div>
      <h2 className="sec">Researcher contact log</h2>
      <table><thead><tr><th className="num">Study day</th><th>Contact</th><th>Recipient</th><th>Type</th><th>Purpose</th></tr></thead><tbody><tr><td className="num">2</td><td>SMS</td><td>Both</td><td>Scheduled</td><td>Technical and support only. No outcome questions.</td></tr><tr><td className="num">7</td><td>SMS plus three questions</td><td>Both, survey to CP</td><td>Scheduled</td><td>Support, plus the day 7 care partner check.</td></tr><tr><td className="num">12 to 13</td><td>None</td><td>—</td><td>Clean</td><td>No contact. Persistence window.</td></tr><tr><td className="num">14</td><td>Interview plus scales</td><td>Both</td><td>Scheduled</td><td>Exit.</td></tr></tbody></table>
    </>
  )
}

function ActiveTab({ tab, data, dyads, currentDyad, openDyad }: { tab: TabKey; data: AnalyticsData; dyads: Dyad[]; currentDyad: Dyad | undefined; openDyad: (code: string) => void }) {
  const scopedCodes = new Set(dyads.map(dyad => dyad.code))
  const scopedQueries = data.queryLog.filter(row => scopedCodes.has(row.code))
  if (tab === 'dyad') return <DyadPage dyad={currentDyad} data={data} />
  if (tab === 'roster') return <RosterTab dyads={dyads} data={data} openDyad={openDyad} />
  if (tab === 'queries') return <QueriesTab rows={scopedQueries} dyads={dyads} data={data} openDyad={openDyad} />
  if (tab === 'threads') return <ThreadsTab data={data} dyads={dyads} openDyad={openDyad} />
  if (tab === 'modality') return <ModalityTab data={data} dyads={dyads} openDyad={openDyad} />
  if (tab === 'partner') return <PartnerTab dyads={dyads} openDyad={openDyad} />
  if (tab === 'sms') return <SmsTab data={data} dyads={dyads} openDyad={openDyad} />
  if (tab === 'persist') return <PersistenceTab data={data} dyads={dyads} openDyad={openDyad} />
  return <DisconfirmationTab data={data} />
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const activeCohort = data.cohorts.find(cohort => cohort.active && cohort.count > 0)?.id ?? data.cohorts.find(cohort => cohort.count > 0)?.id ?? 'pilot-1'
  const initialCohort = typeof window === 'undefined' ? activeCohort : new URLSearchParams(window.location.search).get('cohort') ?? activeCohort
  const [cohort, setCohort] = useState(initialCohort)
  const cohortDyads = data.perDyad.filter(dyad => dyad.cohort === cohort)
  const initialDyads = typeof window === 'undefined' ? cohortDyads.map(dyad => dyad.code) : (new URLSearchParams(window.location.search).get('dyads')?.split(',').filter(Boolean) ?? cohortDyads.map(dyad => dyad.code))
  const [selected, setSelected] = useState(new Set(initialDyads))
  const [currentCode, setCurrentCode] = useState(initialDyads[0] ?? cohortDyads[0]?.code ?? '')
  const [tab, setTab] = useState<TabKey>('dyad')
  const selectedDyads = cohortDyads.filter(dyad => selected.has(dyad.code))
  const currentDyad = data.perDyad.find(dyad => dyad.code === currentCode) ?? selectedDyads[0] ?? cohortDyads[0]
  const activeStudyDays = selectedDyads.filter(row => row.active).map(row => row.currentStudyDay)
  const minDay = activeStudyDays.length ? Math.min(...activeStudyDays) : 0
  const maxDay = activeStudyDays.length ? Math.max(...activeStudyDays) : 0

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('cohort', cohort)
    params.set('dyads', [...selected].join(','))
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }, [cohort, selected])

  function openDyad(code: string) {
    setCurrentCode(code)
    setTab('dyad')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length
    setTab(TABS[nextIndex].key)
    document.getElementById(`tab-${TABS[nextIndex].key}`)?.focus()
  }

  return (
    <main className="pilot-dashboard">
      <div className="wrap">
        <header className="mast"><div className="mast-row"><div><h1>Context Study Instrument</h1><div className="sub">{data.cohorts.find(item => item.id === cohort)?.label ?? 'Pilot cohort'} · individual-first</div></div><div className="stamp">Study day <b>{minDay === maxDay ? maxDay : `${minDay} to ${maxDay}`}</b> across <b>{selectedDyads.filter(row => row.active).length}</b> active<br />Latest event <b>{fmtDate(data.freshness.latestEventAt)}</b> · Last cron <b>{fmtDate(data.freshness.lastCronAt)}</b>{data.freshness.cronWarning ? <><br /><span className="stale">Cron check needed</span></> : null}</div></div></header>
        <ScopeBar data={data} cohort={cohort} setCohort={setCohort} selected={selected} setSelected={setSelected} setCurrentCode={setCurrentCode} setTab={setTab} />
        <div className="prov"><span><span className="pv p-obs">Observed</span>an event the app or Twilio recorded</span><span><span className="pv p-inf">Inferred</span>derived from event patterns, not directly seen</span><span><span className="pv p-rep">Reported</span>from a prompt, check-in, or interview</span></div>
        <nav role="tablist" aria-label="Dashboard sections">{TABS.map((item, index) => <button aria-controls={`panel-${item.key}`} aria-selected={tab === item.key} id={`tab-${item.key}`} key={item.key} onClick={() => setTab(item.key)} onKeyDown={event => onTabKeyDown(event, index)} role="tab" type="button">{item.label}</button>)}</nav>
        <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}><ActiveTab tab={tab} data={data} dyads={selectedDyads} currentDyad={currentDyad} openDyad={openDyad} /></section>
        <p className="foot">Generated {fmtDate(data.generatedAt)} · Admin-only · CSV exports use dyad codes only.</p>
      </div>
      <style jsx global>{`
        .pilot-dashboard{--paper:#F2F3EF;--ink:#16191C;--ink-60:#5A6169;--ink-30:#9AA1A8;--rule:#D6D9D2;--card:#FBFCFA;--obs:#2E5E4E;--inf:#3D4A5C;--rep:#7A5C1E;--alert:#A63A2B;min-height:100svh;background:var(--paper);color:var(--ink);font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
        .pilot-dashboard *{box-sizing:border-box}.pilot-dashboard h1,.pilot-dashboard h2,.pilot-dashboard h3,.pilot-dashboard .v,.pilot-dashboard .q{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:600}.pilot-dashboard .wrap{max-width:1240px;margin:0 auto;padding:0 24px 80px}
        .pilot-dashboard .mast{border-bottom:2px solid var(--ink);padding:24px 0 12px}.pilot-dashboard .mast-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap}.pilot-dashboard .mast h1{font-size:26px;margin:0;letter-spacing:-.01em}.pilot-dashboard .sub{color:var(--ink-60);font-size:11px;text-transform:uppercase;letter-spacing:.13em;margin-top:5px}.pilot-dashboard .stamp{text-align:right;font-size:11px;color:var(--ink-60);line-height:1.7}.pilot-dashboard .stamp b{color:var(--ink)}.pilot-dashboard .stale{color:var(--alert)}
        .pilot-dashboard .scope{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:11px 0;border-bottom:1px solid var(--rule)}.pilot-dashboard .grp{display:flex;gap:7px;align-items:center}.pilot-dashboard label{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-60)}.pilot-dashboard select,.pilot-dashboard input,.pilot-dashboard button.ctl{font:inherit;font-size:11px;background:var(--card);border:1px solid var(--rule);padding:5px 9px;color:var(--ink)}.pilot-dashboard button{cursor:pointer}.pilot-dashboard button.ctl:hover{background:#EBEEE8}.pilot-dashboard button.ctl[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}.pilot-dashboard .chips{display:flex;gap:5px;flex-wrap:wrap}.pilot-dashboard .chip{font:inherit;font-size:10.5px;border:1px solid var(--rule);background:var(--card);padding:3px 8px;color:var(--ink);white-space:nowrap}.pilot-dashboard .chip[aria-pressed="true"]{border-color:var(--ink);background:var(--ink);color:var(--paper)}.pilot-dashboard .n{font-size:11px;color:var(--ink-60);margin-left:auto}
        .pilot-dashboard .prov{display:flex;gap:18px;flex-wrap:wrap;font-size:10.5px;color:var(--ink-60);padding:9px 0;border-bottom:1px solid var(--rule)}.pilot-dashboard .pv{display:inline-block;font-size:9px;letter-spacing:.09em;text-transform:uppercase;padding:1px 5px;border:1px solid currentColor;margin-right:6px;vertical-align:1px}.pilot-dashboard .p-obs{color:var(--obs)}.pilot-dashboard .p-inf{color:var(--inf)}.pilot-dashboard .p-rep{color:var(--rep)}.pilot-dashboard .p-none,.pilot-dashboard .p-mute{color:var(--ink-30)}
        .pilot-dashboard nav{display:flex;border-bottom:1px solid var(--rule);margin-bottom:20px;overflow-x:auto}.pilot-dashboard nav button{background:none;border:0;border-bottom:2px solid transparent;font:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-60);padding:12px 15px;white-space:nowrap;margin-bottom:-1px}.pilot-dashboard nav button:hover{color:var(--ink)}.pilot-dashboard nav button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--ink)}.pilot-dashboard button:focus-visible,.pilot-dashboard a:focus-visible,.pilot-dashboard select:focus-visible,.pilot-dashboard input:focus-visible{outline:2px solid var(--obs);outline-offset:2px}
        .pilot-dashboard .grid{display:grid;gap:13px}.pilot-dashboard .c4{grid-template-columns:repeat(4,1fr)}.pilot-dashboard .c3{grid-template-columns:repeat(3,1fr)}.pilot-dashboard .c2{grid-template-columns:1fr 1fr}.pilot-dashboard .top-grid{margin-top:13px}@media(max-width:900px){.pilot-dashboard .c4,.pilot-dashboard .c3,.pilot-dashboard .c2{grid-template-columns:1fr 1fr}}@media(max-width:620px){.pilot-dashboard .c4,.pilot-dashboard .c3,.pilot-dashboard .c2{grid-template-columns:1fr}.pilot-dashboard .stamp{text-align:left}.pilot-dashboard .strip-head,.pilot-dashboard .strip-row{grid-template-columns:1fr}.pilot-dashboard .tally{text-align:left}}
        .pilot-dashboard .card{background:var(--card);border:1px solid var(--rule);padding:15px}.pilot-dashboard .k{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-60)}.pilot-dashboard .v{font-size:29px;line-height:1.05;margin:8px 0 2px;font-variant-numeric:tabular-nums}.pilot-dashboard .card.sm .v{font-size:22px}.pilot-dashboard .vsub{font-size:11px;color:var(--ink-60)}.pilot-dashboard h2.sec{font-size:16px;margin:32px 0 4px}.pilot-dashboard h2.first{margin-top:12px}.pilot-dashboard h3.sub{font-size:13.5px;margin:22px 0 4px}.pilot-dashboard p.lede{color:var(--ink-60);margin:0 0 13px;max-width:78ch;font-size:12px}.pilot-dashboard .hint{font-size:11px;color:var(--ink-60)}
        .pilot-dashboard .strip-head,.pilot-dashboard .strip-row{display:grid;grid-template-columns:132px 1fr 152px;gap:12px;align-items:center}.pilot-dashboard .strip-head{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-60);padding:0 0 8px;border-bottom:1px solid var(--rule)}.pilot-dashboard .strip-row{width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--rule);padding:9px 0;color:inherit;font:inherit}.pilot-dashboard .strip-row:not(.static):hover{background:#EBEEE8}.pilot-dashboard .dyad{font-size:12px;font-weight:600}.pilot-dashboard .dyad small{display:block;color:var(--ink-30);font-weight:400;font-size:10px}.pilot-dashboard .right{text-align:right}
        .pilot-dashboard .track{position:relative;height:32px;border-left:1px solid var(--rule);border-right:1px solid var(--rule)}.pilot-dashboard .track .wk{position:absolute;top:0;bottom:0;width:1px;background:var(--rule)}.pilot-dashboard .track .clean{position:absolute;top:0;bottom:0;background:#E9ECE6}.pilot-dashboard .track .now{position:absolute;top:0;bottom:0;width:1px;background:var(--ink-30)}.pilot-dashboard .ep{position:absolute;top:5px;width:7px;height:7px;border-radius:50%;transform:translateX(-50%)}.pilot-dashboard .ep.res{background:var(--obs)}.pilot-dashboard .ep.unres{background:none;border:1.5px solid var(--obs)}.pilot-dashboard .ep.nores{background:var(--alert)}.pilot-dashboard .ep.pend{background:var(--ink-30)}.pilot-dashboard .ep.unre{top:20px;width:6px;height:6px;border-radius:0;background:none;border:1px solid var(--ink-30)}.pilot-dashboard .tally{font-size:11px;color:var(--ink-60);text-align:right;font-variant-numeric:tabular-nums}.pilot-dashboard .tally b{color:var(--ink)}
        .pilot-dashboard .legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:var(--ink-60);margin-top:11px}.pilot-dashboard .legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle}.pilot-dashboard .legend .hollow{background:none;border:1.5px solid var(--obs)}.pilot-dashboard .legend .sq{border-radius:0;border:1px solid var(--ink-30);background:none}.pilot-dashboard svg.spark{display:block}
        .pilot-dashboard table{width:100%;border-collapse:collapse;font-size:12px}.pilot-dashboard th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-60);text-align:left;font-weight:400;padding:8px 9px;border-bottom:1px solid var(--ink)}.pilot-dashboard td{padding:9px;border-bottom:1px solid var(--rule);vertical-align:top}.pilot-dashboard td.num,.pilot-dashboard th.num{text-align:right;font-variant-numeric:tabular-nums}.pilot-dashboard tbody tr:hover,.pilot-dashboard tr.click:hover{background:#EBEEE8}.pilot-dashboard tr.click{cursor:pointer}.pilot-dashboard .q{font-size:13.5px}.pilot-dashboard .tag{display:inline-block;font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;padding:2px 6px;border:1px solid currentColor}.pilot-dashboard .t-obs{color:var(--obs)}.pilot-dashboard .t-inf{color:var(--inf)}.pilot-dashboard .t-alert{color:var(--alert)}.pilot-dashboard .t-mute{color:var(--ink-30)}.pilot-dashboard .t-rep{color:var(--rep)}
        .pilot-dashboard .flags{border:1px solid var(--ink);background:var(--card)}.pilot-dashboard .fh{padding:11px 15px;border-bottom:1px solid var(--ink);font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-60)}.pilot-dashboard .f{display:grid;grid-template-columns:1fr 190px;gap:14px;padding:12px 15px;border-bottom:1px solid var(--rule)}.pilot-dashboard .f:last-child{border-bottom:0}.pilot-dashboard .ask{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:13.5px}.pilot-dashboard .ev{font-size:11px;color:var(--ink-60);margin-top:3px}.pilot-dashboard .src{font-size:10px;color:var(--ink-30);text-align:right;letter-spacing:.06em;text-transform:uppercase}.pilot-dashboard .none{padding:14px 15px;font-size:11.5px;color:var(--ink-60)}
        .pilot-dashboard .bar{height:9px;background:#E3E6DF;position:relative;overflow:hidden}.pilot-dashboard .bar span{position:absolute;left:0;top:0;bottom:0;background:var(--inf)}.pilot-dashboard .bar span.g{background:var(--obs)}.pilot-dashboard .bar span.r{background:var(--alert)}.pilot-dashboard .brow{display:grid;grid-template-columns:190px 1fr 54px;gap:10px;align-items:center;padding:6px 0;font-size:11.5px}.pilot-dashboard .brow .n{text-align:right;color:var(--ink-60);font-variant-numeric:tabular-nums}.pilot-dashboard .bars{margin-top:9px}.pilot-dashboard .space{margin-top:7px}
        .pilot-dashboard .ladder{border:1px solid var(--rule);background:var(--card)}.pilot-dashboard .ladder .r{display:grid;grid-template-columns:1fr 74px;gap:12px;padding:11px 15px;border-bottom:1px solid var(--rule);align-items:baseline}.pilot-dashboard .ladder .r:last-child{border-bottom:0}.pilot-dashboard .ladder small{display:block;color:var(--ink-60);font-size:11px;margin-top:2px}.pilot-dashboard .ladder .n{text-align:right;font-variant-numeric:tabular-nums;font-family:Palatino,Georgia,serif;font-size:19px}
        .pilot-dashboard .chain{border:1px solid var(--rule);padding:10px 12px;margin:8px 0;background:var(--paper);font-size:11.5px}.pilot-dashboard .chain .line{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:5px}.pilot-dashboard .chain span.b{border:1px solid var(--rule);padding:2px 7px;background:var(--card)}.pilot-dashboard .chain em{color:var(--ink-30);font-style:normal}.pilot-dashboard .rank{margin-top:6px;font-size:11px;color:var(--ink-60)}.pilot-dashboard .rank ol{margin:4px 0 0 18px;padding:0}.pilot-dashboard .rank li.sel{color:var(--obs);font-weight:600}
        .pilot-dashboard .dis{border:1px solid var(--rule);background:var(--card)}.pilot-dashboard .dis .row{display:grid;grid-template-columns:24px 1fr 128px;gap:12px;padding:14px 16px;border-bottom:1px solid var(--rule);align-items:start}.pilot-dashboard .idx{font-family:Palatino,Georgia,serif;color:var(--ink-30);font-size:15px}.pilot-dashboard .txt small{display:block;color:var(--ink-60);margin-top:4px;font-size:11px}.pilot-dashboard .st{font-size:10px;letter-spacing:.07em;text-transform:uppercase;text-align:right;color:var(--ink-60)}.pilot-dashboard .cmp{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--rule);background:var(--card)}.pilot-dashboard .cmp>div{padding:14px 16px}.pilot-dashboard .cmp>div+div{border-left:1px solid var(--rule)}
        .pilot-dashboard .note{border-left:2px solid var(--ink);padding:2px 0 2px 12px;font-size:11.5px;color:var(--ink-60);margin:14px 0;max-width:80ch}.pilot-dashboard .filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}.pilot-dashboard .restricted{margin-left:auto}.pilot-dashboard .export{color:var(--obs);text-decoration:underline}.pilot-dashboard .inline{margin-left:6px}.pilot-dashboard .foot{text-align:center;color:var(--ink-30);font-size:11px;margin-top:34px}.pilot-dashboard .srt{font:inherit;color:inherit;background:none;border:0;padding:0;text-transform:inherit;letter-spacing:inherit}
        @media (prefers-reduced-motion: reduce){.pilot-dashboard *{scroll-behavior:auto!important;transition:none!important}}
      `}</style>
    </main>
  )
}
