import assert from 'node:assert/strict'
import test from 'node:test'
import type { ScoredCandidate } from './context-rank'
import { chooseRankedNudge, rankedNudgeCopy, rankedNudgeReplyAction, rankedNudgeSafety } from './context-rank-nudges'
import type { PlannedActivity } from '@/types'

function candidate(id: string, score = 0.8): ScoredCandidate {
  return {
    episode: {
      id: `episode:${id}`,
      userId: 'user-1',
      activityLabel: id,
      interval: { earliest: 0, latest: 1 },
      statusDistribution: { planned: 0.7 },
      evidenceIds: [`task_planned:${id}`],
      state: 'ranked',
      shownCount: 0,
    },
    support: score,
    relevance: 1,
    contradiction: 0,
    sessionGate: 1,
    score,
    confidence: score,
    because: { summary: 'Planned today', evidence: [] },
  }
}

function task(id: string, patch: Partial<PlannedActivity> = {}): PlannedActivity {
  return {
    id,
    household_id: 'household-1',
    created_by: 'profile-1',
    assigned_to: null,
    category: 'custom',
    label: 'Other',
    note: `Specific ${id}`,
    expected_period: 'anytime',
    expected_time: null,
    repeat_rule: 'none',
    series_id: null,
    moved_from_id: null,
    planned_for: '2026-08-26',
    status: 'planned',
    confirmed_activity_log_id: null,
    confirmed_at: null,
    source: 'manual',
    created_at: '2026-08-26T08:00:00.000Z',
    updated_at: '2026-08-26T08:00:00.000Z',
    ...patch,
  }
}

test('selects the highest-ranked eligible untimed task and its specific detail', () => {
  const result = chooseRankedNudge([candidate('first'), candidate('second')], [task('first'), task('second')], 'profile-1')
  assert.equal(result?.task.id, 'first')
  assert.equal(result?.detail, 'Specific first')
})

test('skips exact-time, deferred, completed, and differently assigned tasks', () => {
  const candidates = ['timed', 'later', 'done', 'assigned', 'eligible'].map(id => candidate(id))
  const tasks = [
    task('timed', { expected_time: '12:00' }),
    task('later', { status: 'not_now' }),
    task('done', { status: 'confirmed' }),
    task('assigned', { assigned_to: 'profile-2' }),
    task('eligible'),
  ]
  assert.equal(chooseRankedNudge(candidates, tasks, 'profile-1')?.task.id, 'eligible')
})

test('keeps lock-screen detail private while retaining a useful in-app history', () => {
  const privateCopy = rankedNudgeCopy('Call the pharmacy', false)
  assert.equal(privateCopy.pushBody, 'Context has one gentle next-step suggestion.')
  assert.match(privateCopy.historyBody, /Call the pharmacy/)
  assert.match(rankedNudgeCopy('Call the pharmacy', true).pushBody, /Call the pharmacy/)
})

test('enforces daily, cooldown, and recent due-reminder safeguards', () => {
  const nowMs = Date.parse('2026-08-26T16:05:00.000Z')
  assert.equal(rankedNudgeSafety({ sentToday: 2, nowMs }), 'daily_limit')
  assert.equal(rankedNudgeSafety({ sentToday: 1, latestNudgeAt: '2026-08-26T13:00:00.000Z', nowMs }), 'cooldown')
  assert.equal(rankedNudgeSafety({ sentToday: 1, recentDueAt: '2026-08-26T15:55:00.000Z', nowMs }), 'recent_due_reminder')
  assert.equal(rankedNudgeSafety({ sentToday: 1, latestNudgeAt: '2026-08-26T12:00:00.000Z', nowMs }), 'send')
})

test('understands short replies to the latest ranked nudge without guessing from longer messages', () => {
  assert.equal(rankedNudgeReplyAction('Yes'), 'accept')
  assert.equal(rankedNudgeReplyAction('not now'), 'later')
  assert.equal(rankedNudgeReplyAction('I did it'), 'done')
  assert.equal(rankedNudgeReplyAction('Please add call Mary tomorrow'), null)
})
