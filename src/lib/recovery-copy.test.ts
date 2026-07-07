import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRecoveryAnswerText } from './recovery-copy'

test('what was I doing uses a natural gerund form', () => {
  assert.equal(
    buildRecoveryAnswerText({
      intent: 'what_was_i_doing',
      activityLabel: 'Go to the gym',
      statusDistribution: { completed: 0.8 },
      episodeState: 'supported',
    }),
    'You may have been going to the gym.',
  )
})

test('what was I doing turns apply into applying', () => {
  assert.equal(
    buildRecoveryAnswerText({
      intent: 'what_was_i_doing',
      activityLabel: 'Apply to jobs',
      statusDistribution: { completed: 0.8 },
      episodeState: 'supported',
    }),
    'You may have been applying to jobs.',
  )
})

test('did I finish this uses marked object as done wording', () => {
  assert.equal(
    buildRecoveryAnswerText({
      intent: 'did_i_finish_this',
      activityLabel: 'Go to the gym',
      statusDistribution: { completed: 0.8 },
      episodeState: 'supported',
    }),
    'It looks like you marked the gym as done.',
  )
})

test('next step keeps the task as an infinitive', () => {
  assert.equal(
    buildRecoveryAnswerText({
      intent: 'what_should_i_do_next',
      activityLabel: 'Work on publication',
      statusDistribution: { planned: 0.8 },
      episodeState: 'supported',
    }),
    'Your next likely step is to work on publication.',
  )
})

test('next step does not invite a completed item as the next action', () => {
  assert.equal(
    buildRecoveryAnswerText({
      intent: 'what_should_i_do_next',
      activityLabel: 'Apply to jobs',
      statusDistribution: { completed: 0.8 },
      episodeState: 'supported',
    }),
    'You already marked jobs as done.',
  )
})

test('what changed today describes the completed change naturally', () => {
  assert.equal(
    buildRecoveryAnswerText({
      intent: 'what_changed_today',
      activityLabel: 'Go to the gym',
      statusDistribution: { completed: 0.8 },
      episodeState: 'supported',
    }),
    'You marked the gym as done today.',
  )
})

test('planned-only activity avoids claiming it happened', () => {
  assert.equal(
    buildRecoveryAnswerText({
      intent: 'what_was_i_doing',
      activityLabel: 'Find 3k',
      statusDistribution: { planned: 0.8 },
      episodeState: 'supported',
    }),
    'You planned to find 3k, but I am not sure you did it.',
  )
})
