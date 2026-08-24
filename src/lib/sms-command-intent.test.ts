import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractDeleteTarget,
  extractDoneTarget,
  extractStopRepeatingTarget,
  findBestSmsTaskMatches,
  isClearNewSmsIntent,
  isStopRepeatingCommand,
  normalizeTaskTextForSmsMatch,
} from './sms-command-intent'

test('detects fresh task intent that should bypass stale SMS prompts', () => {
  assert.equal(isClearNewSmsIntent('Drive, go to the gym in the evening, find 3k'), true)
  assert.equal(isClearNewSmsIntent('Exactly, so add: Drive, go to the gym'), true)
  assert.equal(isClearNewSmsIntent('Please add drive and gym'), true)
  assert.equal(isClearNewSmsIntent('I plan to drive and go to the gym'), true)
})

test('does not treat prompt replies as fresh task intent', () => {
  assert.equal(isClearNewSmsIntent('Yes'), false)
  assert.equal(isClearNewSmsIntent('No'), false)
  assert.equal(isClearNewSmsIntent('3, 4'), false)
})

test('extracts SMS task command targets', () => {
  assert.equal(extractStopRepeatingTarget('stop repeating go to gym'), 'go to gym')
  assert.equal(extractStopRepeatingTarget('stop go to gym from repeating'), 'go to gym')
  assert.equal(extractStopRepeatingTarget("don't repeat medicine"), 'medicine')
  assert.equal(isStopRepeatingCommand('cancel repeating gym'), true)
  assert.equal(extractDeleteTarget('delete J1 documents'), 'j1 documents')
  assert.equal(extractDoneTarget('done go to gym'), 'go to gym')
  assert.equal(extractDoneTarget('I finished apply to jobs'), 'apply to jobs')
})

test('normalizes and matches task names for SMS commands', () => {
  const tasks = [
    { label: 'Go to the gym', note: null },
    { label: 'Respond to lawyer for J1', note: null },
    { label: 'J1 documents', note: null },
  ]

  assert.equal(normalizeTaskTextForSmsMatch('Go to the gym'), 'go gym')
  assert.deepEqual(findBestSmsTaskMatches('go to gym', tasks), [tasks[0]])
  assert.deepEqual(findBestSmsTaskMatches('J1', tasks), [tasks[1], tasks[2]])
})
