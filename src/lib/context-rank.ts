export type EvidenceSource =
  | 'user_confirmation' | 'activity_log' | 'task_done' | 'task_planned'
  | 'sms_response' | 'reflection' | 'ai_parse' | 'sms_ignored'

export type EvidenceState =
  | 'raw' | 'parsed' | 'linked' | 'supporting' | 'contradicting'
  | 'confirmed' | 'corrected' | 'rejected' | 'stale' | 'archived'

export interface SourceReliability { occ: number; sem: number; time: number }

export interface TimeDistribution {
  earliest: number
  latest: number
  pointEstimate?: number
}

export interface Evidence {
  id: string
  userId: string
  content: string
  source: EvidenceSource
  state: EvidenceState
  time: TimeDistribution
  reliability: SourceReliability
  occurrenceStrength: number
  provenance: string
}

export type EpisodeStatus = 'planned'|'active'|'completed'|'paused'|'abandoned'|'unknown'
export type EpisodeState =
  | 'created'|'supported'|'supported_low'|'ranked'|'shown'
  | 'confirmed'|'rejected'|'conflicted'|'reopened'|'exhausted'|'archived'

export interface Episode {
  id: string
  userId: string
  activityLabel: string
  interval: TimeDistribution
  statusDistribution: Partial<Record<EpisodeStatus, number>>
  evidenceIds: string[]
  state: EpisodeState
  shownCount: number
}

export type RecoveryIntent =
  | 'what_was_i_doing' | 'where_did_i_leave_off' | 'what_should_i_do_next'
  | 'did_i_finish_this' | 'what_changed_today'

export interface RecoveryQuery {
  userId: string
  queryTime: number
  intent: RecoveryIntent
  context?: Record<string, unknown>
}

export interface ContinuityGap {
  time: number
  circumstances: string
  severity: number
  origin: 'user_initiated'
}

export interface BecauseExplanation {
  summary: string
  evidence: Array<{ id: string; source: EvidenceSource; snippet: string }>
}

export interface ScoredCandidate {
  episode: Episode
  support: number
  relevance: number
  contradiction: number
  sessionGate: number
  score: number
  confidence: number
  because: BecauseExplanation
}

export type SessionState =
  | 'idle'|'opened'|'intent_selected'|'graph_built'|'ranked'
  | 'presented'|'awaiting_feedback'|'resolved'|'exhausted'|'closed'

export interface RecoverySession {
  id: string
  userId: string
  state: SessionState
  intent?: RecoveryIntent
  candidateStates: Record<string, EpisodeState>
  history: unknown[]
}

export type AnswerMode = 'leading'|'options'|'weak_clue'|'abstain'

export interface ContinuityCard {
  mode: AnswerMode
  message: string
  candidates: ScoredCandidate[]
  intent: RecoveryIntent
}

export interface ContextRankEvent {
  intent: RecoveryIntent
  time: number
  evidenceSummary: Record<EvidenceSource, number>
  candidateShown?: string
  confidence?: number
  userResponse?: 'confirmed' | 'rejected' | 'corrected'
  outcome: 'resolved' | 'exhausted' | 'presented'
  continuityScore: number
  timeToResolutionSeconds?: number
  followUpAction?: string
}

export interface ContextRankConfig {
  thresholds: { leading: number; options: number; weakClue: number }
  episode: { tauAssign: number; tauMerge: number; gapMaxMs: number }
  scoring: { kappaPerHour: number; shownPenalty: number; tieEpsilon: number }
  exhaustion: { maxShownPerSession: number }
  reliabilityWeights: { occ: number; sem: number; time: number }
  intentWindowsMs: Record<RecoveryIntent, number>
  sourceDefaults: Record<EvidenceSource, { occurrenceStrength: number; reliability: SourceReliability }>
}

export const config: ContextRankConfig = {
  thresholds: { leading: 0.75, options: 0.45, weakClue: 0.25 },
  episode: { tauAssign: 0.60, tauMerge: 0.70, gapMaxMs: 3 * 60 * 60 * 1000 },
  scoring: { kappaPerHour: 0.7, shownPenalty: 0.5, tieEpsilon: 0.02 },
  exhaustion: { maxShownPerSession: 1 },
  reliabilityWeights: { occ: 0.4, sem: 0.3, time: 0.3 },
  intentWindowsMs: {
    what_was_i_doing: 2 * 60 * 60 * 1000,
    where_did_i_leave_off: 24 * 60 * 60 * 1000,
    what_should_i_do_next: 4 * 60 * 60 * 1000,
    did_i_finish_this: 12 * 60 * 60 * 1000,
    what_changed_today: 24 * 60 * 60 * 1000,
  },
  sourceDefaults: {
    user_confirmation: { occurrenceStrength: 0.95, reliability: { occ: 0.95, sem: 0.95, time: 0.70 } },
    activity_log: { occurrenceStrength: 0.85, reliability: { occ: 0.90, sem: 0.85, time: 0.80 } },
    task_done: { occurrenceStrength: 0.80, reliability: { occ: 0.80, sem: 0.85, time: 0.45 } },
    sms_response: { occurrenceStrength: 0.80, reliability: { occ: 0.75, sem: 0.80, time: 0.65 } },
    reflection: { occurrenceStrength: 0.70, reliability: { occ: 0.70, sem: 0.90, time: 0.35 } },
    task_planned: { occurrenceStrength: 0.35, reliability: { occ: 0.35, sem: 0.80, time: 0.60 } },
    ai_parse: { occurrenceStrength: 0.25, reliability: { occ: 0.30, sem: 0.60, time: 0.30 } },
    sms_ignored: { occurrenceStrength: 0.05, reliability: { occ: 0.05, sem: 0.05, time: 0.05 } },
  },
}

export type SimilarityFn = (left: string, right: string) => number
export type InstrumentationSink = (event: ContextRankEvent) => void

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(earlier|confirmed|completed|marked|done|doing|did|made|making|make|took|taking|take|went|going|go|this|today|morning|afternoon|evening|night)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string) {
  const stop = new Set(['a', 'an', 'and', 'for', 'i', 'it', 'me', 'my', 'of', 'the', 'to', 'you', 'your'])
  return normalizeText(value).split(/\s+/).filter(token => token.length > 1 && !stop.has(token))
}

export function defaultSimilarity(left: string, right: string) {
  const a = new Set(tokens(left))
  const b = new Set(tokens(right))
  if (a.size === 0 || b.size === 0) return 0
  const overlap = Array.from(a).filter(token => b.has(token)).length
  return overlap / Math.max(a.size, b.size)
}

function evidenceWeight(evidence: Evidence) {
  return clamp01(evidence.occurrenceStrength)
}

function temporalCompatibility(left: TimeDistribution, right: TimeDistribution, cfg = config) {
  const overlap = Math.min(left.latest, right.latest) - Math.max(left.earliest, right.earliest)
  if (overlap >= 0) return 1
  const gap = Math.max(left.earliest, right.earliest) - Math.min(left.latest, right.latest)
  if (gap >= cfg.episode.gapMaxMs) return 0
  return 1 - gap / cfg.episode.gapMaxMs
}

function episodeSummary(evidence: Evidence[]) {
  return evidence.map(item => item.content).join(' ')
}

function seedable(evidence: Evidence, hasBetterEvidence: boolean) {
  if (evidence.source === 'sms_ignored') return false
  if (evidence.source === 'ai_parse') return !hasBetterEvidence
  return ['activity_log', 'task_done', 'task_planned', 'sms_response', 'reflection', 'user_confirmation'].includes(evidence.source)
}

function episodeIdFor(evidence: Evidence) {
  const label = normalizeText(evidence.content).replace(/\s+/g, '-')
  return `${evidence.userId}:${label || evidence.id}`
}

function initialStatus(evidence: Evidence): Partial<Record<EpisodeStatus, number>> {
  if (evidence.source === 'task_planned') return { planned: 0.70, unknown: 0.30 }
  if (evidence.source === 'user_confirmation') return { completed: 0.72, unknown: 0.28 }
  if (['activity_log', 'task_done', 'sms_response'].includes(evidence.source)) return { completed: 0.82, unknown: 0.18 }
  if (evidence.source === 'reflection') return { completed: 0.55, unknown: 0.45 }
  return { unknown: 1 }
}

function mergeStatus(left: Partial<Record<EpisodeStatus, number>>, right: Partial<Record<EpisodeStatus, number>>) {
  const merged: Partial<Record<EpisodeStatus, number>> = {}
  for (const key of ['planned', 'active', 'completed', 'paused', 'abandoned', 'unknown'] as EpisodeStatus[]) {
    merged[key] = Math.max(left[key] ?? 0, right[key] ?? 0)
  }
  const total = Object.values(merged).reduce((sum, value) => sum + (value ?? 0), 0) || 1
  for (const key of Object.keys(merged) as EpisodeStatus[]) merged[key] = (merged[key] ?? 0) / total
  return merged
}

function buildBecause(episode: Episode, evidenceById: Map<string, Evidence>): BecauseExplanation {
  const evidence = episode.evidenceIds
    .map(id => evidenceById.get(id))
    .filter((item): item is Evidence => Boolean(item))
    .filter(item => item.source !== 'sms_ignored')
    .slice(0, 3)
    .map(item => ({
      id: item.id,
      source: item.source,
      snippet: item.content.slice(0, 120),
    }))
  const sources = Array.from(new Set(evidence.map(item => sourceLabel(item.source))))
  return {
    summary: sources.length > 0 ? `I'm basing this on ${sources.join(' and ')}.` : 'I do not have enough evidence for this.',
    evidence,
  }
}

function sourceLabel(source: EvidenceSource) {
  const labels: Record<EvidenceSource, string> = {
    user_confirmation: 'what you confirmed',
    activity_log: 'an activity note',
    task_done: 'a task marked done',
    task_planned: "today's plan",
    sms_response: 'your message',
    reflection: 'your reflection',
    ai_parse: 'a saved Context note',
    sms_ignored: 'a missed prompt',
  }
  return labels[source]
}

export function constructEpisodes(evidence: Evidence[], similarity: SimilarityFn = defaultSimilarity, cfg = config): Episode[] {
  const betterEvidenceExists = evidence.some(item => !['ai_parse', 'sms_ignored'].includes(item.source))
  const seeds = evidence.filter(item => seedable(item, betterEvidenceExists))
  const episodes = seeds.map(seed => ({
    id: episodeIdFor(seed),
    userId: seed.userId,
    activityLabel: seed.content,
    interval: { ...seed.time },
    statusDistribution: initialStatus(seed),
    evidenceIds: [seed.id],
    state: seed.occurrenceStrength >= 0.45 ? 'supported' as EpisodeState : 'supported_low' as EpisodeState,
    shownCount: 0,
  }))

  for (const item of evidence) {
    if (item.source === 'sms_ignored') continue
    let best: { episode: Episode; score: number } | null = null
    for (const episode of episodes) {
      const sem = similarity(item.content, episode.activityLabel)
      const temp = temporalCompatibility(item.time, episode.interval, cfg)
      const score = 0.65 * sem + 0.35 * temp
      if (!best || score > best.score) best = { episode, score }
    }
    if (best && best.score >= cfg.episode.tauAssign && !best.episode.evidenceIds.includes(item.id)) {
      best.episode.evidenceIds.push(item.id)
      best.episode.interval = {
        earliest: Math.min(best.episode.interval.earliest, item.time.earliest),
        latest: Math.max(best.episode.interval.latest, item.time.latest),
        pointEstimate: best.episode.interval.pointEstimate ?? item.time.pointEstimate,
      }
      best.episode.statusDistribution = mergeStatus(best.episode.statusDistribution, initialStatus(item))
    }
  }

  return mergeEpisodes(episodes, evidence, similarity, cfg)
}

function mergeEpisodes(episodes: Episode[], evidence: Evidence[], similarity: SimilarityFn, cfg: ContextRankConfig) {
  const evidenceById = new Map(evidence.map(item => [item.id, item]))
  const merged: Episode[] = []
  for (const episode of episodes) {
    const existing = merged.find(candidate => {
      const sem = similarity(candidate.activityLabel, episode.activityLabel)
      const temp = temporalCompatibility(candidate.interval, episode.interval, cfg)
      const overlap = episode.evidenceIds.some(id => candidate.evidenceIds.includes(id)) ? 1 : 0
      const conflict = episodeConflict([...candidate.evidenceIds, ...episode.evidenceIds].map(id => evidenceById.get(id)).filter(Boolean) as Evidence[])
      return (0.6 * sem + 0.25 * temp + 0.25 * overlap - 0.35 * conflict) >= cfg.episode.tauMerge
    })
    if (!existing) {
      merged.push({ ...episode, evidenceIds: Array.from(new Set(episode.evidenceIds)) })
      continue
    }
    existing.evidenceIds = Array.from(new Set([...existing.evidenceIds, ...episode.evidenceIds]))
    existing.interval = {
      earliest: Math.min(existing.interval.earliest, episode.interval.earliest),
      latest: Math.max(existing.interval.latest, episode.interval.latest),
      pointEstimate: existing.interval.pointEstimate ?? episode.interval.pointEstimate,
    }
    existing.statusDistribution = mergeStatus(existing.statusDistribution, episode.statusDistribution)
  }
  return merged
}

function episodeConflict(evidence: Evidence[]) {
  const contradictionStrengths = evidence
    .filter(item => ['contradicting', 'corrected', 'rejected', 'stale'].includes(item.state))
    .map(item => item.occurrenceStrength)
  return noisyOr(contradictionStrengths)
}

export function noisyOr(values: number[]) {
  return 1 - values.reduce((product, value) => product * (1 - clamp01(value)), 1)
}

export function supportForEpisode(episode: Episode, evidenceById: Map<string, Evidence>, cfg = config) {
  const evidence = episode.evidenceIds.map(id => evidenceById.get(id)).filter((item): item is Evidence => Boolean(item))
  const occurrence = noisyOr(evidence.map(item => item.occurrenceStrength))
  const weightedReliability = evidence.reduce((sum, item) => {
    const rbar = cfg.reliabilityWeights.occ * item.reliability.occ +
      cfg.reliabilityWeights.sem * item.reliability.sem +
      cfg.reliabilityWeights.time * item.reliability.time
    return sum + evidenceWeight(item) * rbar
  }, 0)
  const totalWeight = evidence.reduce((sum, item) => sum + evidenceWeight(item), 0) || 1
  return clamp01(occurrence * (weightedReliability / totalWeight))
}

function statusFit(status: Partial<Record<EpisodeStatus, number>>, intent: RecoveryIntent) {
  if (intent === 'what_was_i_doing') return clamp01((status.active ?? 0) * 1 + (status.completed ?? 0) * 0.95 + (status.planned ?? 0) * 0.35 + (status.unknown ?? 0) * 0.25)
  if (intent === 'where_did_i_leave_off') return clamp01((status.active ?? 0) + (status.paused ?? 0) + (status.planned ?? 0) * 0.55 + (status.completed ?? 0) * 0.20 + (status.unknown ?? 0) * 0.35)
  if (intent === 'what_should_i_do_next') return clamp01((status.planned ?? 0) + (status.paused ?? 0) * 0.75 + (status.active ?? 0) * 0.65 + (status.unknown ?? 0) * 0.25)
  if (intent === 'did_i_finish_this') return clamp01((status.completed ?? 0) + (status.active ?? 0) * 0.35 + (status.planned ?? 0) * 0.25 + (status.unknown ?? 0) * 0.45)
  return clamp01((status.completed ?? 0) + (status.active ?? 0) * 0.5 + (status.planned ?? 0) * 0.4 + (status.unknown ?? 0) * 0.3)
}

function temporalRelevance(interval: TimeDistribution, queryTime: number, cfg = config) {
  const d = queryTime >= interval.earliest && queryTime <= interval.latest
    ? 0
    : Math.min(Math.abs(queryTime - interval.earliest), Math.abs(queryTime - interval.latest))
  const hours = d / (60 * 60 * 1000)
  return clamp01(Math.exp(-cfg.scoring.kappaPerHour * hours))
}

function sessionGate(episode: Episode, session: RecoverySession, cfg = config) {
  const state = session.candidateStates[episode.id] ?? episode.state
  if (state === 'rejected' || state === 'exhausted') return 0
  if (state === 'confirmed') return 0
  if (state === 'shown') return cfg.scoring.shownPenalty
  return 1
}

export function scoreEpisodes(
  episodes: Episode[],
  evidence: Evidence[],
  query: RecoveryQuery,
  session: RecoverySession,
  similarity: SimilarityFn = defaultSimilarity,
  cfg = config,
): ScoredCandidate[] {
  const evidenceById = new Map(evidence.map(item => [item.id, item]))
  const queryText = query.intent.replace(/_/g, ' ')
  return episodes.map(episode => {
    const support = supportForEpisode(episode, evidenceById, cfg)
    const semantic = Math.max(similarity(episode.activityLabel, queryText), similarity(episodeSummary(episode.evidenceIds.map(id => evidenceById.get(id)).filter(Boolean) as Evidence[]), queryText))
    const typefit = statusFit(episode.statusDistribution, query.intent)
    const temporal = temporalRelevance(episode.interval, query.queryTime, cfg)
    const relevance = clamp01(Math.max(semantic, 0.72) * typefit * temporal)
    const contradiction = episodeConflict(episode.evidenceIds.map(id => evidenceById.get(id)).filter(Boolean) as Evidence[])
    const gate = sessionGate(episode, session, cfg)
    const score = clamp01(support * relevance * gate * (1 - contradiction))
    const confidence = clamp01(support * temporal * (1 - contradiction))
    return {
      episode: { ...episode, state: 'ranked' as EpisodeState },
      support,
      relevance,
      contradiction,
      sessionGate: gate,
      score,
      confidence,
      because: buildBecause(episode, evidenceById),
    }
  }).sort((left, right) => compareCandidates(left, right, query, evidenceById, cfg))
}

function compareCandidates(left: ScoredCandidate, right: ScoredCandidate, query: RecoveryQuery, evidenceById: Map<string, Evidence>, cfg: ContextRankConfig) {
  if (Math.abs(left.score - right.score) >= cfg.scoring.tieEpsilon) return right.score - left.score
  if (left.confidence !== right.confidence) return right.confidence - left.confidence
  const leftTemporal = temporalRelevance(left.episode.interval, query.queryTime, cfg)
  const rightTemporal = temporalRelevance(right.episode.interval, query.queryTime, cfg)
  if (leftTemporal !== rightTemporal) return rightTemporal - leftTemporal
  const leftOccurrence = noisyOr(left.episode.evidenceIds.map(id => evidenceById.get(id)?.occurrenceStrength ?? 0))
  const rightOccurrence = noisyOr(right.episode.evidenceIds.map(id => evidenceById.get(id)?.occurrenceStrength ?? 0))
  if (leftOccurrence !== rightOccurrence) return rightOccurrence - leftOccurrence
  const leftRecent = Math.max(...left.episode.evidenceIds.map(id => evidenceById.get(id)?.time.pointEstimate ?? 0))
  const rightRecent = Math.max(...right.episode.evidenceIds.map(id => evidenceById.get(id)?.time.pointEstimate ?? 0))
  if (leftRecent !== rightRecent) return rightRecent - leftRecent
  if (left.contradiction !== right.contradiction) return left.contradiction - right.contradiction
  return left.episode.activityLabel.length - right.episode.activityLabel.length
}

export function decideContinuityCard(candidates: ScoredCandidate[], query: RecoveryQuery, cfg = config): ContinuityCard {
  const valid = candidates.filter(candidate => candidate.score > 0 && candidate.because.evidence.length > 0)
  const top = valid[0]
  if (!top || top.confidence < cfg.thresholds.weakClue) {
    return {
      mode: 'abstain',
      message: "I don't have a clear enough note for that right now.",
      candidates: [],
      intent: query.intent,
    }
  }
  if (top.confidence >= cfg.thresholds.leading) {
    return {
      mode: 'leading',
      message: leadingMessage(top, query.intent),
      candidates: [top],
      intent: query.intent,
    }
  }
  if (top.confidence >= cfg.thresholds.options) {
    return {
      mode: 'options',
      message: 'These are the best possibilities I found.',
      candidates: valid.slice(0, 3),
      intent: query.intent,
    }
  }
  return {
    mode: 'weak_clue',
    message: `This is only a clue: ${top.episode.activityLabel}.`,
    candidates: [top],
    intent: query.intent,
  }
}

function leadingMessage(candidate: ScoredCandidate, intent: RecoveryIntent) {
  const label = candidate.episode.activityLabel.replace(/[?.!]+$/, '')
  if (intent === 'what_should_i_do_next') return `Your next likely step is ${label}.`
  if (intent === 'did_i_finish_this') return `It looks like ${label} may be finished.`
  if (intent === 'where_did_i_leave_off') return `You may have left off with ${label}.`
  if (intent === 'what_changed_today') return `One clear change today is ${label}.`
  return `You may have been doing ${label}.`
}

export function runContextRank(input: {
  evidence: Evidence[]
  query: RecoveryQuery
  session?: RecoverySession
  similarity?: SimilarityFn
  instrumentation?: InstrumentationSink
  config?: ContextRankConfig
}): { session: RecoverySession; episodes: Episode[]; candidates: ScoredCandidate[]; card: ContinuityCard } {
  const cfg = input.config ?? config
  const session = input.session ?? {
    id: `session:${input.query.userId}:${input.query.queryTime}`,
    userId: input.query.userId,
    state: 'intent_selected' as SessionState,
    intent: input.query.intent,
    candidateStates: {},
    history: [],
  }
  const episodes = constructEpisodes(input.evidence, input.similarity ?? defaultSimilarity, cfg)
  const candidates = scoreEpisodes(episodes, input.evidence, input.query, session, input.similarity ?? defaultSimilarity, cfg)
  const card = decideContinuityCard(candidates, input.query, cfg)
  const nextState: SessionState = card.mode === 'abstain' ? 'exhausted' : 'presented'
  const updatedSession = {
    ...session,
    state: nextState,
    intent: input.query.intent,
    history: [...session.history, { type: 'ranked', at: input.query.queryTime, mode: card.mode }],
  }
  input.instrumentation?.({
    intent: input.query.intent,
    time: input.query.queryTime,
    evidenceSummary: summarizeEvidence(input.evidence),
    candidateShown: card.candidates[0]?.episode.id,
    confidence: card.candidates[0]?.confidence,
    outcome: card.mode === 'abstain' ? 'exhausted' : 'presented',
    continuityScore: card.candidates[0]?.score ?? 0,
  })
  return { session: updatedSession, episodes, candidates, card }
}

export function applyFeedback(
  session: RecoverySession,
  episodeId: string,
  response: 'confirmed' | 'rejected' | 'corrected',
  at: number,
): RecoverySession {
  const state: EpisodeState = response === 'confirmed' ? 'confirmed' : response === 'rejected' ? 'rejected' : 'conflicted'
  return {
    ...session,
    state: response === 'confirmed' ? 'resolved' : 'ranked',
    candidateStates: { ...session.candidateStates, [episodeId]: state },
    history: [...session.history, { type: 'feedback', response, episodeId, at }],
  }
}

export function summarizeEvidence(evidence: Evidence[]) {
  return evidence.reduce((summary, item) => {
    summary[item.source] = (summary[item.source] ?? 0) + 1
    return summary
  }, {
    user_confirmation: 0,
    activity_log: 0,
    task_done: 0,
    task_planned: 0,
    sms_response: 0,
    reflection: 0,
    ai_parse: 0,
    sms_ignored: 0,
  } as Record<EvidenceSource, number>)
}

export function makeEvidence(input: {
  id: string
  userId: string
  content: string
  source: EvidenceSource
  state?: EvidenceState
  time: TimeDistribution
  provenance: string
  occurrenceStrength?: number
  reliability?: SourceReliability
}, cfg = config): Evidence {
  const defaults = cfg.sourceDefaults[input.source]
  return {
    id: input.id,
    userId: input.userId,
    content: input.content,
    source: input.source,
    state: input.state ?? 'supporting',
    time: input.time,
    reliability: input.reliability ?? defaults.reliability,
    occurrenceStrength: input.occurrenceStrength ?? defaults.occurrenceStrength,
    provenance: input.provenance,
  }
}

export function seededSyntheticEvidence(seed: number, userId = 'synthetic-user'): Evidence[] {
  const base = 1_700_000_000_000 + seed * 10_000
  const labels = ['breakfast', 'car service', 'walk', 'library']
  return labels.map((label, index) => makeEvidence({
    id: `synthetic:${seed}:${index}`,
    userId,
    content: label,
    source: index % 2 === 0 ? 'task_done' : 'reflection',
    time: {
      earliest: base + index * 30 * 60 * 1000,
      latest: base + index * 30 * 60 * 1000 + 30 * 60 * 1000,
      pointEstimate: base + index * 30 * 60 * 1000,
    },
    provenance: `synthetic:${index}`,
  }))
}
