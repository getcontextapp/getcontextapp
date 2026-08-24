import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isReflectionCommandNoise,
  isSmsActionLikeInput,
  shouldSaveSmsAsReflectionReply,
} from './sms-reflection-guard'

test('blocks SMS task commands from being saved as reflection', () => {
  const commands = [
    'Move 3 and 4',
    'Move 3, 4',
    'delete',
    'delete 1 and 2',
    'remove all',
    'stop repeating',
    'done',
    'Add: drive, go to the gym',
    'I plan to drive and go to the gym',
    'change gym to 6',
    'reschedule gym to evening',
    '3, 4',
    'yes',
    'no',
  ]

  for (const command of commands) {
    assert.equal(isSmsActionLikeInput(command), true, command)
    assert.equal(shouldSaveSmsAsReflectionReply(command), false, command)
  }
})

test('allows ordinary reflection replies after a reflection prompt', () => {
  const reflections = [
    'I felt good today after lunch.',
    'Went grocery shopping and called a friend.',
    'I had lunch and felt productive.',
  ]

  for (const reflection of reflections) {
    assert.equal(isSmsActionLikeInput(reflection), false, reflection)
    assert.equal(shouldSaveSmsAsReflectionReply(reflection), true, reflection)
  }
})

test('detects command-only reflection noise for ContextRank evidence', () => {
  assert.equal(isReflectionCommandNoise('Move 3 and 4'), true)
  assert.equal(isReflectionCommandNoise('delete\nyes'), true)
  assert.equal(isReflectionCommandNoise('Went to the store and felt calm.'), false)
})
