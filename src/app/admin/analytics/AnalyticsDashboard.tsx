'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'

type AnalyticsData = Awaited<ReturnType<typeof import('@/lib/pilot-analytics').loadPilotAnalytics>>
type TabKey = 'recovery' | 'threads' | 'queries' | 'modality' | 'partner' | 'sms' | 'persist' | 'disconf'
type Provenance = 'obs' | 'inf' | 'rep'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'recovery', label: 'Recovery' },
  { key: 'threads', label: 'Threads' },
  { key: 'queries', label: 'Query log' },
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

function outcomeLabel(outcome: string) {
  const labels: Record<string, string> = {
    resolved: 'resumed after result',
    unresolved_after_result: 'no resumption after result',
    rank_failure: 'relevant context ranked low',
    no_context: 'nothing relevant held',
    pending: 'pending window',
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
    <div className="card">
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

function EmptyRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="hint">Not instrumented</td></tr>
}

function RecoveryStrip({ data }: { data: AnalyticsData }) {
  const [selectedCode, setSelectedCode] = useState(data.perDyad[0]?.code ?? '')
  const selected = data.perDyad.find(dyad => dyad.code === selectedCode) ?? data.perDyad[0]

  return (
    <>
      <div className="strip-head"><div>Dyad</div><div>Day 1 &nbsp;→&nbsp; Day 14</div><div className="right">Tally</div></div>
      {data.perDyad.map(dyad => (
        <button className={`strip-row ${dyad.code === selected?.code ? 'on' : ''}`} data-code={dyad.code} key={dyad.id} onClick={() => setSelectedCode(dyad.code)} type="button">
          <div className="dyad">{dyad.code}<small>{dyad.active ? 'active' : 'withdrawn'}</small></div>
          <div className="track">
            <span className="clean" style={{ left: `${(11 / 14) * 100}%`, right: `${(1 / 14) * 100}%` }} />
            <span className="wk" style={{ left: '50%' }} />
            {data.recovery.episodes.filter(episode => episode.householdId === dyad.id).map(episode => {
              const left = `${Math.min(100, Math.max(0, (episode.t / 14) * 100))}%`
              const cls = episode.outcome === 'resolved' ? 'res' : episode.outcome === 'no_context' ? 'nores' : 'unres'
              return <i aria-hidden="true" className={`ep ${cls}`} key={episode.id} style={{ left }} title={`Day ${episode.day} · ${episode.query}`} />
            })}
            {data.recovery.startedUnresolved.filter(thread => thread.householdId === dyad.id).map(thread => (
              <i aria-hidden="true" className="ep unre" key={thread.id} style={{ left: `${Math.min(100, Math.max(0, (thread.t / 14) * 100))}%` }} title={`Started, unresolved: ${thread.title}`} />
            ))}
          </div>
          <div className="tally"><b>{dyad.resumed}</b> resumed · {dyad.attempts} attempts · {dyad.unresolved} unresolved</div>
        </button>
      ))}
      <div className="legend">
        <span><i style={{ background: 'var(--obs)' }} />Resumed after retrieval</span>
        <span><i className="hollow" />Result, no resumption observed</span>
        <span><i style={{ background: 'var(--alert)' }} />Nothing relevant held</span>
        <span><i className="sq" />Started, unresolved</span>
      </div>
      {selected && <RecoveryDetail dyad={selected} />}
    </>
  )
}

function RecoveryDetail({ dyad }: { dyad: AnalyticsData['perDyad'][number] }) {
  return (
    <div className="detail">
      <h3>{dyad.code}</h3>
      <div className="meta">{dyad.active ? 'Active' : 'Withdrawn'} · day 7 care partner report on reminding: <b>pending</b> · extra checking created by Context: <b>pending</b></div>
      <div className="mini">
        <div><div className="k">Attempts</div><div className="v">{dyad.attempts}</div></div>
        <div><div className="k">Resumed after</div><div className="v">{dyad.resumed}</div></div>
        <div><div className="k">Nothing held</div><div className="v">{dyad.nothingHeld}</div></div>
        <div><div className="k">Ranked low</div><div className="v">0</div></div>
        <div><div className="k">Captured</div><div className="v">{dyad.captured}</div></div>
        <div><div className="k">Started, unresolved</div><div className="v">{dyad.unresolved}</div></div>
        <div><div className="k">Reflections saved</div><div className="v">{dyad.reflectionsSaved}</div></div>
        <div><div className="k">Reflection→retrieval</div><div className="v">{dyad.reflectionUsed}</div></div>
      </div>
      <div className="k">Most recent episodes</div>
      {dyad.recentEpisodes.length === 0 && <p className="hint">No recovery attempts recorded.</p>}
      {dyad.recentEpisodes.map(episode => (
        <div className="chain" key={episode.id}>
          <div className="line">
            <span className="b">day {episode.day}</span><em>→</em>
            <span className="b">{episode.mode}{episode.switched ? ' (after abandoned voice)' : ''}</span><em>→</em>
            <span className="q">“{episode.query}”</span>
          </div>
          <div className="line">
            <em>→</em><span className="b">{episode.candidateCount ?? 'Not instrumented'} candidates</span><em>→</em>
            <span className="b">{episode.selectedRank ? `selected rank ${episode.selectedRank}, from ${episode.selectedSource}` : 'nothing selected'}</span><em>→</em>
            <span className="b">{episode.resumed ? 'thread resumed' : 'no resumption observed'}</span>
            <span className={`tag ${outcomeTag(episode.outcome)}`}>{outcomeLabel(episode.outcome)}</span>
          </div>
          {episode.candidates.length > 0 && (
            <div className="rank">Context Rank returned:<ol>{episode.candidates.map(candidate => <li className={candidate === episode.selectedLabel ? 'sel' : ''} key={candidate}>{candidate}{candidate === episode.selectedLabel ? ' — selected' : ''}</li>)}</ol></div>
          )}
          {episode.reported
            ? <div className="rank"><span className="pv p-rep">Reported</span>participant said: “{episode.reported}”</div>
            : <div className="rank"><span className="pv p-mute">No report</span>event prompt not answered. Independence uncorroborated.</div>}
        </div>
      ))}
    </div>
  )
}

function RecoveryTab({ data }: { data: AnalyticsData }) {
  return (
    <>
      <div className="grid c4 top-grid">
        <Kpi label="Recovery attempts" value={data.recovery.attempts} sub={`across ${data.perDyad.filter(dyad => dyad.attempts > 0).length} of ${data.perDyad.length} dyads`} provenance="obs" />
        <Kpi label="Resumed after retrieval" value={data.recovery.resumed} sub={`in ${data.recovery.resumedDyads} dyads · app-observed only`} provenance="obs" />
        <Kpi label="Corroborated by report" value={data.recovery.corroborated} sub="participant said they got going again" provenance="rep" />
        <Kpi label="Retrieval returned nothing" value={data.recovery.nothingHeld} sub="no relevant context held" provenance="obs" />
      </div>
      <h2 className="sec">Recovery episodes by dyad</h2>
      <p className="lede">Each row is fourteen days. Filled dots are attempts where the thread was subsequently resumed, hollow dots are attempts with a result but no observed resumption, red dots are attempts Context could not answer. Small squares are threads started and left unresolved. The shaded band is the clean window with no scheduled contact.</p>
      <RecoveryStrip data={data} />
      <div className="note">The app cannot see a spoken reminder, a phone call, or someone walking into the room. Absence of a care partner event therefore does not establish that a recovery was independent. Everything on this tab is app-observed sequence. Independence is an interpretation, and it requires the event prompt or the exit interview to corroborate.</div>
    </>
  )
}

function ThreadsTab({ data }: { data: AnalyticsData }) {
  return (
    <>
      <div className="grid c4 top-grid">
        <Kpi label="Captured" value={data.threads.captured} sub="activities successfully recorded" provenance="obs" />
        <Kpi label="Completed" value={data.threads.completed} sub={`${pct(data.threads.completed, data.threads.captured)} of captured`} provenance="obs" />
        <Kpi label="Moved or cancelled" value={data.threads.movedOrCancelled} sub="deliberate change, not a break" provenance="obs" />
        <Kpi label="Started, unresolved" value={data.threads.startedUnresolved} sub="no terminal event in the window" provenance="obs" />
      </div>
      <h2 className="sec">Capture states</h2>
      <p className="lede">Five distinct states, not one bucket. An unanswered morning text is not a capture failure. The person may have had nothing to report.</p>
      <Ladder rows={[
        { title: 'Captured successfully', sub: 'Activity created and persisted, any modality.', value: data.threads.captured },
        { title: 'Capture initiated, abandoned', sub: 'Input opened, mic started, or field focused, nothing submitted. Speaks to H4 friction.', value: data.threads.captureAbandoned },
        { title: 'Prompt delivered, no response', sub: 'Morning text reached the phone, no reply. Not evidence of failure on its own.', value: data.threads.promptNoResponse },
        { title: 'Captured, later resolved', sub: 'Completed, moved, or cancelled.', value: data.threads.capturedLaterResolved },
        { title: 'Captured, later unresolved', sub: 'Started, no terminal event. Analytical classification as a dropped thread requires corroborating evidence.', value: data.threads.capturedLaterUnresolved },
      ]} />
      <h2 className="sec">Retrieval outcomes</h2>
      <p className="lede">Four levels, each pointing at a different fix. Nothing held is a capture problem. Ranked low is a retrieval problem. No resumption after a good result is a product problem or was never a break at all.</p>
      <Ladder rows={[
        { title: 'Resolved', sub: 'Result returned, selected, thread subsequently resumed or completed.', value: data.threads.retrievalResolved },
        { title: 'Unresolved after result', sub: 'Context answered. Nothing followed in the observation window.', value: data.threads.retrievalUnresolvedAfterResult },
        { title: 'Ranking failure', sub: 'Relevant context existed and was returned below the selection point.', value: data.threads.retrievalRankFailure },
        { title: 'No context held', sub: 'Nothing relevant existed to return. The query text is the artifact.', value: data.threads.retrievalNoContext },
      ]} />
      <h2 className="sec">Per dyad</h2>
      <table><thead><tr><th>Dyad</th><th className="num">Captured</th><th className="num">Abandoned</th><th className="num">Completed</th><th className="num">Unresolved</th><th className="num">Attempts</th><th className="num">Resumed</th><th className="num">Nothing held</th></tr></thead><tbody>
        {data.perDyad.length === 0 ? <EmptyRow colSpan={8} /> : data.perDyad.map(dyad => <tr key={dyad.id}><td>{dyad.code}{dyad.active ? '' : ' '} {!dyad.active && <span className="tag t-alert">out</span>}</td><td className="num">{dyad.captured}</td><td className="num">{dyad.abandoned}</td><td className="num">{dyad.completed}</td><td className="num">{dyad.unresolved}</td><td className="num">{dyad.attempts}</td><td className="num">{dyad.resumed}</td><td className="num">{dyad.nothingHeld}</td></tr>)}
      </tbody></table>
    </>
  )
}

function QueriesTab({ data }: { data: AnalyticsData }) {
  const [filter, setFilter] = useState('all')
  const [dyad, setDyad] = useState('all')
  const [search, setSearch] = useState('')
  const rows = useMemo(() => data.queryLog.filter(row => {
    if (filter !== 'all' && row.outcome !== filter) return false
    if (dyad !== 'all' && row.code !== dyad) return false
    if (search && !row.query.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [data.queryLog, dyad, filter, search])
  return (
    <>
      <h2 className="sec first">Raw query log</h2>
      <p className="lede">The highest-value artifact the pilot produces. Every string a participant typed or spoke, stored verbatim. Any cleaned or model-interpreted version lives in a separate column and never overwrites this one.</p>
      <div className="filters">
        <span className="k">Show</span>
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All {data.queryLog.length} attempts</option>
          <option value="no_context">Nothing held ({data.recovery.nothingHeld})</option>
          <option value="rank_failure">Ranked low ({data.recovery.rankFailure})</option>
          <option value="unresolved_after_result">No resumption after result ({data.recovery.unresolvedAfterResult})</option>
          <option value="resolved">Resumed ({data.recovery.resumed})</option>
        </select>
        <select value={dyad} onChange={event => setDyad(event.target.value)}>
          <option value="all">All dyads</option>
          {data.perDyad.map(row => <option value={row.code} key={row.code}>{row.code}</option>)}
        </select>
        <input aria-label="Search query text" placeholder="Search query text" value={search} onChange={event => setSearch(event.target.value)} />
        <a className="export" href={`/api/admin/analytics/export?dataset=queries&days=${data.filters.days}`}>Export CSV</a>
        <span className="k restricted">Restricted column. Named in consent.</span>
      </div>
      <table><thead><tr><th>Dyad</th><th className="num">Day</th><th>Query, verbatim</th><th>Mode</th><th>Candidates</th><th>Selected</th><th>Thread</th><th>Participant report</th><th>Outcome</th></tr></thead><tbody>
        {rows.length === 0 ? <EmptyRow colSpan={9} /> : rows.map(row => (
          <tr key={row.id}>
            <td>{row.code}</td><td className="num">{row.day}</td><td className="q">“{row.query}”</td>
            <td><span className="tag t-inf">{row.mode}</span>{row.switched && <> <span className="tag t-mute">switched</span></>}</td>
            <td>{row.candidateCount ?? 'Not instrumented'}</td><td>{row.selectedRank ? `#${row.selectedRank} · ${row.selectedSource}` : '—'}</td><td>{row.resumed ? 'resumed' : '—'}</td>
            <td>{row.reported ? <span className="tag t-obs">{row.reported}</span> : <span className="tag t-mute">no report</span>}</td>
            <td><span className={`tag ${outcomeTag(row.outcome)}`}>{outcomeLabel(row.outcome)}</span></td>
          </tr>
        ))}
      </tbody></table>
      <div className="note">Context Rank sits inside this table rather than in its own tab: candidate count, rank position of the selection, and whether anything was selected. That is what separates Context did not know it from Context knew it and buried it.</div>
    </>
  )
}

function ModalityTab({ data }: { data: AnalyticsData }) {
  const captureTotal = Object.values(data.modality.captureModes).reduce((sum, value) => sum + value, 0)
  const retrievalTotal = Object.values(data.modality.retrievalModes).reduce((sum, value) => sum + value, 0)
  return (
    <>
      <div className="grid c4 top-grid">
        <Kpi label="Voice completion" value={pct(data.modality.voiceSaved, data.modality.voiceStarted)} sub={`${data.modality.voiceSaved} saved of ${data.modality.voiceStarted} started`} provenance="obs" />
        <Kpi label="Modality switches" value={data.modality.switches} sub="abandoned one input, completed in another" provenance="obs" />
        <Kpi label="Reflection completion" value={pct(data.modality.reflectionSaved, data.modality.reflectionStarted)} sub={`${data.modality.reflectionSaved} saved of ${data.modality.reflectionStarted} started`} provenance="obs" />
        <Kpi label="Reflection → retrieval" value={data.modality.reflectionUsed} sub="a saved reflection was the selected source" provenance="obs" />
      </div>
      <h2 className="sec">Capture versus retrieval</h2>
      <p className="lede">Two different questions. Someone can tap happily to create an activity and reach for voice the moment they are stuck. Aggregating them hides exactly the thing RQ2 asks about.</p>
      <div className="grid c2">
        <div className="card"><div className="k">How they capture</div><div className="bars">{(['voice', 'typed', 'tap', 'sms'] as const).map(mode => <Bar key={mode} label={mode} value={data.modality.captureModes[mode]} total={captureTotal} />)}</div></div>
        <div className="card"><div className="k">How they retrieve when stuck</div><div className="bars">{(['voice', 'typed', 'tap'] as const).map(mode => <Bar key={mode} label={mode} value={data.modality.retrievalModes[mode]} total={retrievalTotal} />)}<div className="hint space">SMS is not a retrieval path in this build.</div></div></div>
      </div>
      <h2 className="sec">Abandonment</h2>
      <p className="lede">Started means the input opened. A wide gap means the modality is present in the interface and absent from the data, which is a finding about friction rather than about memory.</p>
      <Bar label="Mic opened" value={data.modality.voiceStarted} total={data.modality.voiceStarted} />
      <Bar label="Voice capture saved" value={data.modality.voiceSaved} total={data.modality.voiceStarted} tone="g" />
      <Bar label="Voice abandoned" value={data.modality.voiceAbandoned} total={data.modality.voiceStarted} tone="r" />
      <Bar label="Reflection started" value={data.modality.reflectionStarted} total={data.modality.reflectionStarted} />
      <Bar label="Reflection saved" value={data.modality.reflectionSaved} total={data.modality.reflectionStarted} tone="g" />
      <h2 className="sec">Reflection as a retrieval source</h2>
      <p className="lede">Not how many reflections were written. Whether something captured casually later came back when it was needed. That is the Context thesis in one number.</p>
      <Bar label="Reflections saved" value={data.modality.reflectionSaved} total={data.modality.reflectionSaved} />
      <Bar label="Later returned as a candidate" value={data.modality.reflectionReturned} total={data.modality.reflectionSaved} tone="g" />
      <Bar label="Later selected during a break" value={data.modality.reflectionUsed} total={data.modality.reflectionSaved} tone="g" />
    </>
  )
}

function PartnerTab({ data }: { data: AnalyticsData }) {
  return (
    <>
      <div className="grid c3 top-grid">
        <Kpi label="Dashboard opens / day" value={`${data.partner.week1OpensPerDay.toFixed(1)} → ${data.partner.week2OpensPerDay.toFixed(1)}`} sub="week 1 → week 2, per dyad" provenance="obs" />
        <Kpi label="Days viewed" value={data.partner.daysViewed} sub={`across ${data.perDyad.filter(row => row.active).length} active dyads`} provenance="obs" />
        <Kpi label="Reported less reminding" value={data.partner.reportedLessReminding} sub="day 7 check-in" provenance="rep" />
      </div>
      <h2 className="sec">Visibility, not intervention</h2>
      <p className="lede">The care partner views in Context; they do not act in it. Everything in the left columns is checking behavior. Offload is not visible here and cannot be. It is triangulated from the right columns.</p>
      <table><thead><tr><th>Dyad</th><th className="num">Wk 1 opens/day</th><th className="num">Wk 2 opens/day</th><th className="num">Direction</th><th>Day 7: reminding<span className="pv p-rep inline">rep</span></th><th>Day 7: extra checking from Context<span className="pv p-rep inline">rep</span></th><th>Day 14: stopped doing / still did</th></tr></thead><tbody>
        {data.perDyad.length === 0 ? <EmptyRow colSpan={7} /> : data.perDyad.map(row => <tr key={row.id}><td>{row.code}</td><td className="num">{row.week1CpOpensPerDay.toFixed(1)}</td><td className="num">{row.week2CpOpensPerDay.toFixed(1)}</td><td className="num">{row.week2CpOpensPerDay > row.week1CpOpensPerDay ? '↑' : row.week2CpOpensPerDay < row.week1CpOpensPerDay ? '↓' : '→'}</td><td className="hint">pending</td><td className="hint">pending</td><td className="hint">pending exit</td></tr>)}
      </tbody></table>
      <div className="note">Partner-in-window was removed. Classifying a recovery as partner-assisted because the dashboard opened nearby asserted a causal link the telemetry cannot support. The three reported columns carry the offload claim, and the day 14 pair, what you stopped doing and what you still did exactly as before, does most of the work.</div>
    </>
  )
}

function SmsTab({ data }: { data: AnalyticsData }) {
  return (
    <>
      <div className="grid c4 top-grid">
        <Kpi label="Sent" value={data.sms.sent} sub="morning prompts" provenance="obs" />
        <Kpi label="Delivered" value={data.sms.delivered} sub={`${pct(data.sms.delivered, data.sms.sent)} · Twilio callback`} provenance="obs" />
        <Kpi label="Replied" value={data.sms.replied} sub={`${pct(data.sms.replied, data.sms.delivered)} of delivered`} provenance="obs" />
        <Kpi label="Reply used" value={data.sms.parsed} sub="created or updated a thread" provenance="obs" />
      </div>
      <h2 className="sec">Lifecycle</h2>
      <p className="lede">Delivery failures are fixable inside the study window. Replies Context could not parse are a different problem and belong to the next build.</p>
      <Ladder rows={[
        { title: 'Sent', sub: 'Scheduled and dispatched.', value: data.sms.sent },
        { title: 'Delivered', sub: 'Carrier receipt. The floor for everything else.', value: data.sms.delivered },
        { title: 'Delivered, no reply', sub: 'Not a failure on its own.', value: data.sms.deliveredNoReply },
        { title: 'Replied', sub: 'Inbound message received.', value: data.sms.replied },
        { title: 'Reply created or updated a thread', sub: 'The round trip actually landed in Context.', value: data.sms.parsed },
        { title: 'Replied, not usable', sub: 'Received but Context could not parse or act on it.', value: data.sms.notUsable },
      ]} />
      <h2 className="sec">Per dyad</h2>
      <table><thead><tr><th>Dyad</th><th className="num">Sent</th><th className="num">Delivered</th><th className="num">Replied</th><th className="num">Reply rate</th><th className="num">Median latency</th><th className="num">Landed in Context</th></tr></thead><tbody>
        {data.perDyad.length === 0 ? <EmptyRow colSpan={7} /> : data.perDyad.map(row => <tr key={row.id}><td>{row.code}</td><td className="num">{row.smsSent}</td><td className="num">{row.smsDelivered}</td><td className="num">{row.smsReplied}</td><td className="num">{pct(row.smsReplied, row.smsDelivered)}</td><td className="num">{row.smsMedianLatency ? `${row.smsMedianLatency} min` : '—'}</td><td className="num">{row.smsParsed}</td></tr>)}
      </tbody></table>
      <div className="note">Open rate is unavailable for ordinary SMS. Delivery receipts and inbound replies are the defensible signals.</div>
    </>
  )
}

function PersistenceTab({ data }: { data: AnalyticsData }) {
  return (
    <>
      <div className="grid c3 top-grid">
        <Kpi label="Meaningful-use days" value={`${data.persistence.useDaysWeek1} → ${data.persistence.useDaysWeek2}`} sub="week 1 → week 2, all active dyads" provenance="obs" />
        <Kpi label="Attempts in clean window" value={data.persistence.cleanWindowAttempts} sub="days 12 to 13, no scheduled contact" provenance="obs" />
        <Kpi label="Dyads active in week 2" value={`${data.persistence.activeWeek2Dyads} of ${data.perDyad.length}`} sub="at least one meaningful-use day" provenance="obs" />
      </div>
      <h2 className="sec">Meaningful use</h2>
      <p className="lede">A day counts if at least one substantive event occurred: a capture, a saved reflection, a recovery attempt, an activity state change, or a substantive SMS reply. Opening the app is not use. This is also the column to read against the exit question about the last three days, where a mismatch is information rather than error.</p>
      <h2 className="sec">Week 1 versus week 2, per dyad</h2>
      <p className="lede">Described, not tested. Twelve dyads over two weeks cannot support an inference about change.</p>
      <table><thead><tr><th>Dyad</th><th className="num">Use days</th><th className="num">Captures</th><th className="num">Attempts</th><th className="num">Reflections</th><th className="num">CP opens/day</th><th className="num">Clean window</th></tr></thead><tbody>
        {data.perDyad.length === 0 ? <EmptyRow colSpan={7} /> : data.perDyad.map(row => <tr key={row.id}><td>{row.code}</td><td className="num">{row.useDaysWeek1} → {row.useDaysWeek2}</td><td className="num">{row.capturesWeek1} → {row.capturesWeek2}</td><td className="num">{row.attemptsWeek1} → {row.attemptsWeek2}</td><td className="num">{row.reflectionsWeek1} → {row.reflectionsWeek2}</td><td className="num">{row.week1CpOpensPerDay.toFixed(1)} → {row.week2CpOpensPerDay.toFixed(1)}</td><td className="num">{row.cleanWindowAttempts}</td></tr>)}
      </tbody></table>
    </>
  )
}

function DisconfirmationTab({ data }: { data: AnalyticsData }) {
  const rows = [
    ['No participant with MCI shows a corroborated independent recovery', `${data.disconfirmation.corroboratedDyads} of ${data.perDyad.length} dyads have at least one episode where the thread resumed and the participant reported getting going again. ${data.disconfirmation.observedResumptions} episodes show app-observed resumption in total, of which ${data.disconfirmation.corroboratedEpisodes} are corroborated. Exit interview evidence pending for all dyads.`],
    ['Care partners keep doing their previous work while Context adds checking', `${data.disconfirmation.risingNoDrop} dyads show rising dashboard opens in week 2 without a reported drop in reminding. ${data.disconfirmation.extraChecking} reported at day 7 that Context created extra checking. The day 14 pair, what stopped and what continued unchanged, is the deciding evidence and is not yet collected.`],
    ['Use occurs around researcher contact and does not persist', `${data.disconfirmation.attemptsNearContact} of ${data.recovery.attempts} recovery attempts fall within a day of the day 2 or day 7 contact. ${data.disconfirmation.cleanWindowAttempts} attempts fall in the clean window on days 12 and 13. Any unscheduled support contact is listed in the log below and should be read alongside this.`],
    ['Dyadic privacy requirements conflict with no resolving configuration', 'Not derivable from telemetry. Coded from the private care partner block at baseline, the joint sharing question, and the day 14 question on whether their view changed.'],
  ]
  return (
    <>
      <h2 className="sec first">Predefined disconfirmation</h2>
      <p className="lede">Written into the protocol before enrollment. These are the patterns that would send the core hypothesis back for revision. No verdicts and no cutoffs: twelve dyads cannot support a threshold, and a computed tripped label would be false precision dressed as rigour. The panel shows the evidence; the researcher makes the call.</p>
      <div className="dis">{rows.map((row, index) => <div className="row" key={row[0]}><div className="idx">{String.fromCharCode(65 + index)}</div><div className="txt">{row[0]}<small>{row[1]}</small></div><div className="st">Researcher<br />interpretation</div></div>)}</div>
      <h2 className="sec">Researcher contact log</h2>
      <p className="lede">Two scheduled touches, identical for every dyad. Anything else is an exception, logged individually with a reason, so week-two use can be read against a known contact pattern rather than an adaptive one.</p>
      <table><thead><tr><th>Day</th><th>Contact</th><th>Recipient</th><th>Type</th><th>Purpose</th></tr></thead><tbody>
        <tr><td>2</td><td>SMS</td><td>Both</td><td>Scheduled</td><td>Technical and support only. No outcome questions.</td></tr>
        <tr><td>7</td><td>SMS + three questions</td><td>Both, survey to care partner</td><td>Scheduled</td><td>Support, plus the day 7 care partner check.</td></tr>
        <tr><td>12 to 13</td><td>None</td><td>—</td><td>Clean</td><td>No contact. Persistence window.</td></tr>
        <tr><td>14</td><td>Interview + scales</td><td>Both</td><td>Scheduled</td><td>Exit.</td></tr>
      </tbody></table>
      <div className="note">Automatic re-engagement of dyads that go quiet was removed from the schedule. Rescuing disengagement makes persistence uninterpretable, and a dyad going quiet is itself a finding. Genuine technical or welfare problems still get contact, immediately, recorded as an exception with the reason attached.</div>
    </>
  )
}

function ActiveTab({ tab, data }: { tab: TabKey; data: AnalyticsData }) {
  if (tab === 'recovery') return <RecoveryTab data={data} />
  if (tab === 'threads') return <ThreadsTab data={data} />
  if (tab === 'queries') return <QueriesTab data={data} />
  if (tab === 'modality') return <ModalityTab data={data} />
  if (tab === 'partner') return <PartnerTab data={data} />
  if (tab === 'sms') return <SmsTab data={data} />
  if (tab === 'persist') return <PersistenceTab data={data} />
  return <DisconfirmationTab data={data} />
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const [tab, setTab] = useState<TabKey>('recovery')
  const activeStudyDays = data.perDyad.filter(row => row.active).map(row => row.currentStudyDay)
  const minDay = activeStudyDays.length ? Math.min(...activeStudyDays) : 0
  const maxDay = activeStudyDays.length ? Math.max(...activeStudyDays) : 0

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
        <header className="mast">
          <div className="mast-row">
            <div>
              <h1>Context Validation Study</h1>
              <div className="sub">Pilot instrument · event-level telemetry</div>
            </div>
            <div className="stamp">
              Day <b>{minDay === maxDay ? maxDay : `${minDay} to ${maxDay}`}</b> of 14 · <b>{data.perDyad.length}</b> dyads enrolled · <b>{data.perDyad.filter(row => row.active).length}</b> active<br />
              Latest event <b>{fmtDate(data.freshness.latestEventAt)}</b> · Last cron <b>{fmtDate(data.freshness.lastCronAt)}</b>{data.freshness.cronWarning ? ' · cron check needed' : ''}
            </div>
          </div>
        </header>
        <div className="prov">
          <span><span className="pv p-obs">Observed</span>an event the app or Twilio recorded</span>
          <span><span className="pv p-inf">Inferred</span>derived from event patterns, not directly seen</span>
          <span><span className="pv p-rep">Reported</span>from a check-in, prompt, or interview</span>
        </div>
        <nav role="tablist" aria-label="Dashboard sections">
          {TABS.map((item, index) => (
            <button aria-controls={`panel-${item.key}`} aria-selected={tab === item.key} id={`tab-${item.key}`} key={item.key} onClick={() => setTab(item.key)} onKeyDown={event => onTabKeyDown(event, index)} role="tab" type="button">{item.label}</button>
          ))}
        </nav>
        <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <ActiveTab tab={tab} data={data} />
        </section>
        <p className="foot">Generated {fmtDate(data.generatedAt)} · Admin-only · Exported data may contain restricted columns.</p>
      </div>
      <style jsx global>{`
        .pilot-dashboard{--paper:#F2F3EF;--ink:#16191C;--ink-60:#5A6169;--ink-30:#9AA1A8;--rule:#D6D9D2;--card:#FBFCFA;--obs:#2E5E4E;--inf:#3D4A5C;--rep:#7A5C1E;--alert:#A63A2B;min-height:100svh;background:#F2F3EF;color:#16191C;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
        .pilot-dashboard *{box-sizing:border-box}
        .pilot-dashboard h1,.pilot-dashboard h2,.pilot-dashboard h3,.pilot-dashboard .disp,.pilot-dashboard .v,.pilot-dashboard .q{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:600}
        .pilot-dashboard .wrap{max-width:1240px;margin:0 auto;padding:0 24px 80px}
        .pilot-dashboard .mast{border-bottom:2px solid #16191C;padding:26px 0 14px}
        .pilot-dashboard .mast-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap}
        .pilot-dashboard .mast h1{font-size:27px;margin:0;letter-spacing:-.01em}
        .pilot-dashboard .sub{color:#5A6169;font-size:11px;text-transform:uppercase;letter-spacing:.13em;margin-top:5px}
        .pilot-dashboard .stamp{text-align:right;font-size:11px;color:#5A6169;line-height:1.7}
        .pilot-dashboard .stamp b{color:#16191C}
        .pilot-dashboard .prov{display:flex;gap:18px;flex-wrap:wrap;font-size:10.5px;color:#5A6169;padding:10px 0;border-bottom:1px solid #D6D9D2;letter-spacing:.02em}
        .pilot-dashboard .pv{display:inline-block;font-size:9px;letter-spacing:.09em;text-transform:uppercase;padding:1px 5px;border:1px solid currentColor;margin-right:6px;vertical-align:1px}
        .pilot-dashboard .p-obs{color:#2E5E4E}.pilot-dashboard .p-inf{color:#3D4A5C}.pilot-dashboard .p-rep{color:#7A5C1E}.pilot-dashboard .p-mute{color:#9AA1A8;border-color:#9AA1A8}
        .pilot-dashboard nav{display:flex;border-bottom:1px solid #D6D9D2;margin-bottom:22px;overflow-x:auto}
        .pilot-dashboard nav button{background:none;border:0;border-bottom:2px solid transparent;font:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5A6169;padding:12px 16px;cursor:pointer;white-space:nowrap;margin-bottom:-1px}
        .pilot-dashboard nav button:hover{color:#16191C}
        .pilot-dashboard nav button[aria-selected="true"]{color:#16191C;border-bottom-color:#16191C}
        .pilot-dashboard button:focus-visible,.pilot-dashboard a:focus-visible,.pilot-dashboard select:focus-visible,.pilot-dashboard input:focus-visible{outline:2px solid #2E5E4E;outline-offset:2px}
        .pilot-dashboard .grid{display:grid;gap:14px}.pilot-dashboard .c4{grid-template-columns:repeat(4,1fr)}.pilot-dashboard .c3{grid-template-columns:repeat(3,1fr)}.pilot-dashboard .c2{grid-template-columns:1fr 1fr}.pilot-dashboard .top-grid{margin-top:6px}
        @media(max-width:900px){.pilot-dashboard .c4,.pilot-dashboard .c3{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){.pilot-dashboard .c4,.pilot-dashboard .c3,.pilot-dashboard .c2{grid-template-columns:1fr}.pilot-dashboard .stamp{text-align:left}.pilot-dashboard .strip-head,.pilot-dashboard .strip-row{grid-template-columns:58px 1fr}.pilot-dashboard .tally{grid-column:2;text-align:left}}
        .pilot-dashboard .card{background:#FBFCFA;border:1px solid #D6D9D2;padding:16px}
        .pilot-dashboard .k{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:#5A6169}
        .pilot-dashboard .v{font-size:31px;line-height:1.05;margin:8px 0 2px;font-variant-numeric:tabular-nums}
        .pilot-dashboard .vsub{font-size:11px;color:#5A6169}
        .pilot-dashboard h2.sec{font-size:16px;margin:34px 0 4px}.pilot-dashboard h2.first{margin-top:14px}
        .pilot-dashboard p.lede{color:#5A6169;margin:0 0 14px;max-width:76ch;font-size:12px}
        .pilot-dashboard .strip-head,.pilot-dashboard .strip-row{display:grid;grid-template-columns:76px 1fr 150px;gap:12px;align-items:center}
        .pilot-dashboard .strip-head{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#5A6169;padding:0 0 8px;border-bottom:1px solid #D6D9D2}
        .pilot-dashboard .strip-row{width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid #D6D9D2;padding:9px 0;cursor:pointer;color:inherit;font:inherit}
        .pilot-dashboard .strip-row:hover{background:#EBEEE8}.pilot-dashboard .strip-row.on{background:#E6EBE4}
        .pilot-dashboard .dyad{font-size:12px;font-weight:600}.pilot-dashboard .dyad small{display:block;color:#9AA1A8;font-weight:400;font-size:10px}
        .pilot-dashboard .track{position:relative;height:34px;border-left:1px solid #D6D9D2;border-right:1px solid #D6D9D2}
        .pilot-dashboard .track .wk{position:absolute;top:0;bottom:0;width:1px;background:#D6D9D2}.pilot-dashboard .track .clean{position:absolute;top:0;bottom:0;background:#E9ECE6}
        .pilot-dashboard .ep{position:absolute;top:5px;width:7px;height:7px;border-radius:50%;transform:translateX(-50%)}.pilot-dashboard .ep.res{background:#2E5E4E}.pilot-dashboard .ep.unres{background:none;border:1.5px solid #2E5E4E}.pilot-dashboard .ep.nores{background:#A63A2B}.pilot-dashboard .ep.unre{top:21px;width:6px;height:6px;border-radius:0;background:none;border:1px solid #9AA1A8}
        .pilot-dashboard .tally{font-size:11px;color:#5A6169;text-align:right;font-variant-numeric:tabular-nums}.pilot-dashboard .tally b{color:#16191C}.pilot-dashboard .right{text-align:right}
        .pilot-dashboard .legend{display:flex;gap:15px;flex-wrap:wrap;font-size:10.5px;color:#5A6169;margin-top:12px}.pilot-dashboard .legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle}.pilot-dashboard .legend .hollow{background:none;border:1.5px solid #2E5E4E}.pilot-dashboard .legend .sq{border-radius:0;border:1px solid #9AA1A8;background:none}
        .pilot-dashboard table{width:100%;border-collapse:collapse;font-size:12px}.pilot-dashboard th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#5A6169;text-align:left;font-weight:400;padding:8px 10px;border-bottom:1px solid #16191C}.pilot-dashboard td{padding:9px 10px;border-bottom:1px solid #D6D9D2;vertical-align:top}.pilot-dashboard td.num,.pilot-dashboard th.num{text-align:right;font-variant-numeric:tabular-nums}.pilot-dashboard tbody tr:hover{background:#EBEEE8}
        .pilot-dashboard .q{font-size:13.5px}.pilot-dashboard .tag{display:inline-block;font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;padding:2px 6px;border:1px solid currentColor}.pilot-dashboard .t-obs{color:#2E5E4E}.pilot-dashboard .t-inf{color:#3D4A5C}.pilot-dashboard .t-alert{color:#A63A2B}.pilot-dashboard .t-mute{color:#9AA1A8}
        .pilot-dashboard .bar{height:9px;background:#E3E6DF;position:relative;overflow:hidden}.pilot-dashboard .bar span{position:absolute;left:0;top:0;bottom:0;background:#3D4A5C}.pilot-dashboard .bar span.g{background:#2E5E4E}.pilot-dashboard .bar span.r{background:#A63A2B}.pilot-dashboard .brow{display:grid;grid-template-columns:190px 1fr 56px;gap:10px;align-items:center;padding:6px 0;font-size:11.5px}.pilot-dashboard .brow .n{text-align:right;color:#5A6169;font-variant-numeric:tabular-nums}
        .pilot-dashboard .ladder{border:1px solid #D6D9D2;background:#FBFCFA}.pilot-dashboard .ladder .r{display:grid;grid-template-columns:1fr 74px;gap:12px;padding:11px 15px;border-bottom:1px solid #D6D9D2;align-items:baseline}.pilot-dashboard .ladder .r:last-child{border-bottom:0}.pilot-dashboard .ladder .r b{font-weight:600}.pilot-dashboard .ladder .r small{display:block;color:#5A6169;font-size:11px;margin-top:2px}.pilot-dashboard .ladder .n{text-align:right;font-variant-numeric:tabular-nums;font-family:Palatino,Georgia,serif;font-size:19px}
        .pilot-dashboard .dis{border:1px solid #D6D9D2;background:#FBFCFA}.pilot-dashboard .dis .row{display:grid;grid-template-columns:24px 1fr 130px;gap:12px;padding:14px 16px;border-bottom:1px solid #D6D9D2;align-items:start}.pilot-dashboard .dis .row:last-child{border-bottom:0}.pilot-dashboard .idx{font-family:Palatino,Georgia,serif;color:#9AA1A8;font-size:15px}.pilot-dashboard .txt{font-size:12px}.pilot-dashboard .txt small{display:block;color:#5A6169;margin-top:4px;font-size:11px;line-height:1.55}.pilot-dashboard .st{font-size:10px;letter-spacing:.07em;text-transform:uppercase;text-align:right;color:#5A6169;padding-top:2px}
        .pilot-dashboard .detail{border:1px solid #16191C;background:#FBFCFA;padding:18px;margin-top:16px}.pilot-dashboard .detail h3{margin:0 0 3px;font-size:16px}.pilot-dashboard .meta{font-size:11px;color:#5A6169;margin-bottom:14px}.pilot-dashboard .mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px;margin-bottom:16px}.pilot-dashboard .mini div{border:1px solid #D6D9D2;padding:9px 10px}.pilot-dashboard .mini .v{font-size:21px;margin:4px 0 0}
        .pilot-dashboard .chain{border:1px solid #D6D9D2;padding:10px 12px;margin:8px 0;background:#F2F3EF;font-size:11.5px}.pilot-dashboard .chain .line{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:5px}.pilot-dashboard .chain .line:last-child{margin-bottom:0}.pilot-dashboard .chain span.b{border:1px solid #D6D9D2;padding:2px 7px;background:#FBFCFA}.pilot-dashboard .chain em{color:#9AA1A8;font-style:normal}.pilot-dashboard .rank{margin-top:6px;font-size:11px;color:#5A6169}.pilot-dashboard .rank ol{margin:4px 0 0 18px;padding:0}.pilot-dashboard .rank li{margin:1px 0}.pilot-dashboard .rank li.sel{color:#2E5E4E;font-weight:600}
        .pilot-dashboard .note{border-left:2px solid #16191C;padding:2px 0 2px 12px;font-size:11.5px;color:#5A6169;margin:14px 0;max-width:80ch}.pilot-dashboard .hint{font-size:11px;color:#5A6169}.pilot-dashboard .space{margin-top:8px}
        .pilot-dashboard select,.pilot-dashboard input{font:inherit;font-size:11px;background:#FBFCFA;border:1px solid #D6D9D2;padding:5px 8px;color:#16191C}.pilot-dashboard .filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}.pilot-dashboard .restricted{margin-left:auto}.pilot-dashboard .export{color:#2E5E4E;text-decoration:underline}.pilot-dashboard .inline{margin-left:6px}.pilot-dashboard .bars{margin-top:10px}.pilot-dashboard .foot{text-align:center;color:#9AA1A8;font-size:11px;margin-top:34px}
        @media (prefers-reduced-motion: reduce){.pilot-dashboard *{scroll-behavior:auto!important;transition:none!important}}
      `}</style>
    </main>
  )
}
