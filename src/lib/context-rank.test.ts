import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyFeedback,
  config,
  constructEpisodes,
  makeEvidence,
  noisyOr,
  runContextRank,
  scoreEpisodes,
  supportForEpisode,
  type Evidence,
  type RecoveryQuery,
  type RecoverySession,
} from './context-rank'

const base = Date.parse('2026-06-29T12:00:00Z')

function windowAt(minutesAgo: number) {
  const point = base - minutesAgo * 60 * 1000
  return {
    earliest: point - 15 * 60 * 1000,
    latest: point + 15 * 60 * 1000,
    pointEstimate: point,
  }
}

function session(userId = 'u1'): RecoverySession {
  return {
    id: 's1',
    userId,
    state: 'intent_selected',
    intent: 'what_was_i_doing',
    candidateStates: {},
    history: [],
  }
}

function query(intent: RecoveryQuery['intent']): RecoveryQuery {
  return { userId: 'u1', queryTime: base, intent }
}

test('uses noisy-OR for occurrence strength', () => {
  assert.equal(noisyOr([0.35, 0.70]).toFixed(6), '0.805000')
})

test('support is identical across intents while relevance changes', () => {
  const evidence = [
    makeEvidence({ id: 'done', userId: 'u1', content: 'car service', source: 'task_done', time: windowAt(20), provenance: 'planned_activities:done' }),
    makeEvidence({ id: 'plan', userId: 'u1', content: 'car service', source: 'task_planned', time: windowAt(20), provenance: 'planned_activities:plan' }),
  ]
  const episodes = constructEpisodes(evidence)
  const evidenceById = new Map(evidence.map(item => [item.id, item]))
  const support = supportForEpisode(episodes[0], evidenceById)
  const doing = scoreEpisodes(episodes, evidence, query('what_was_i_doing'), session())[0]
  const next = scoreEpisodes(episodes, evidence, query('what_should_i_do_next'), session())[0]
  assert.equal(doing.support, support)
  assert.equal(next.support, support)
  assert.notEqual(doing.relevance, next.relevance)
})

test('factored score is support times relevance times gate times non-contradiction', () => {
  const evidence = [makeEvidence({ id: 'a', userId: 'u1', content: 'made breakfast', source: 'task_done', time: windowAt(10), provenance: 'activity_logs:a' })]
  const episodes = constructEpisodes(evidence)
  const scored = scoreEpisodes(episodes, evidence, query('what_was_i_doing'), session())[0]
  assert.equal(scored.score, scored.support * scored.relevance * scored.sessionGate * (1 - scored.contradiction))
})

test('recent corroborated episode outranks an old task_done for what_was_i_doing', () => {
  const evidence = [
    makeEvidence({ id: 'old', userId: 'u1', content: 'went to pharmacy', source: 'task_done', time: windowAt(8 * 60), provenance: 'activity_logs:old' }),
    makeEvidence({ id: 'recent-plan', userId: 'u1', content: 'car service', source: 'task_planned', time: windowAt(10), provenance: 'planned_activities:recent' }),
    makeEvidence({ id: 'recent-reflect', userId: 'u1', content: 'handled car service', source: 'reflection', time: windowAt(8), provenance: 'reflections:recent' }),
  ]
  const result = runContextRank({ evidence, query: query('what_was_i_doing'), session: session() })
  assert.match(result.candidates[0].episode.activityLabel, /car service|handled car/i)
})

test('what_should_i_do_next prefers planned work over an already completed item', () => {
  const evidence = [
    makeEvidence({ id: 'done-log', userId: 'u1', content: 'go to the gym', source: 'activity_log', time: windowAt(5), provenance: 'activity_logs:done' }),
    makeEvidence({ id: 'done-task', userId: 'u1', content: 'go to the gym', source: 'task_done', time: windowAt(5), provenance: 'planned_activities:done' }),
    makeEvidence({ id: 'planned', userId: 'u1', content: 'work on publication', source: 'task_planned', time: windowAt(0), provenance: 'planned_activities:planned' }),
  ]
  const result = runContextRank({ evidence, query: query('what_should_i_do_next'), session: session() })
  assert.match(result.candidates[0].episode.activityLabel, /work on publication/i)
})

test('rejected candidate does not return in the same session', () => {
  const evidence = [
    makeEvidence({ id: 'a', userId: 'u1', content: 'made breakfast', source: 'task_done', time: windowAt(10), provenance: 'activity_logs:a' }),
    makeEvidence({ id: 'b', userId: 'u1', content: 'went for a walk', source: 'task_done', time: windowAt(12), provenance: 'activity_logs:b' }),
  ]
  const first = runContextRank({ evidence, query: query('what_was_i_doing'), session: session() })
  const rejectedId = first.card.candidates[0].episode.id
  const nextSession = applyFeedback(first.session, rejectedId, 'rejected', base)
  const second = runContextRank({ evidence, query: query('what_was_i_doing'), session: nextSession })
  assert.notEqual(second.card.candidates[0]?.episode.id, rejectedId)
})

test('random rejection sequences terminate in finite steps', () => {
  const evidence: Evidence[] = [
    makeEvidence({ id: 'a', userId: 'u1', content: 'breakfast', source: 'task_done', time: windowAt(5), provenance: 'a' }),
    makeEvidence({ id: 'b', userId: 'u1', content: 'walk', source: 'task_done', time: windowAt(15), provenance: 'b' }),
    makeEvidence({ id: 'c', userId: 'u1', content: 'library', source: 'task_planned', time: windowAt(25), provenance: 'c' }),
  ]
  let current = session()
  for (let step = 0; step < 8; step += 1) {
    const result = runContextRank({ evidence, query: query('what_was_i_doing'), session: current })
    if (result.card.mode === 'abstain') {
      assert.equal(result.session.state, 'exhausted')
      return
    }
    const candidate = result.card.candidates[0]
    current = applyFeedback(result.session, candidate.episode.id, 'rejected', base + step)
  }
  const final = runContextRank({ evidence, query: query('what_was_i_doing'), session: current })
  assert.equal(final.card.mode, 'abstain')
})

test('only ignored SMS and AI parse abstains', () => {
  const evidence = [
    makeEvidence({ id: 'ignored', userId: 'u1', content: 'No response', source: 'sms_ignored', time: windowAt(20), provenance: 'sms_messages:ignored' }),
    makeEvidence({ id: 'ai', userId: 'u1', content: 'maybe a vague plan', source: 'ai_parse', time: windowAt(20), provenance: 'context_cards:ai' }),
  ]
  const result = runContextRank({ evidence, query: query('what_was_i_doing'), session: session() })
  assert.equal(result.card.mode, 'abstain')
  assert.equal(result.card.candidates.length, 0)
})

test('non-abstain cards always include because evidence', () => {
  const evidence = [makeEvidence({ id: 'a', userId: 'u1', content: 'made breakfast', source: 'task_done', time: windowAt(10), provenance: 'activity_logs:a' })]
  const result = runContextRank({ evidence, query: query('what_was_i_doing'), session: session() })
  assert.notEqual(result.card.mode, 'abstain')
  assert.ok(result.card.candidates.every(candidate => candidate.because.evidence.length > 0))
})

test('identical inputs produce identical outputs', () => {
  const evidence = [makeEvidence({ id: 'a', userId: 'u1', content: 'made breakfast', source: 'task_done', time: windowAt(10), provenance: 'activity_logs:a' })]
  const first = runContextRank({ evidence, query: query('what_was_i_doing'), session: session() })
  const second = runContextRank({ evidence, query: query('what_was_i_doing'), session: session() })
  assert.deepEqual(first.card, second.card)
})

test('configuration exposes required thresholds and priors', () => {
  assert.equal(config.thresholds.leading, 0.75)
  assert.equal(config.exhaustion.maxShownPerSession, 1)
  assert.equal(config.sourceDefaults.task_done.reliability.time, 0.45)
})
