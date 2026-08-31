import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ambiguousTimeRangeClarification,
  countPlanWords,
  detectSafeTimelineCapture,
  plannedDateForText,
  splitPlanClauses,
} from './natural-language-input'

test('does not misclassify future or multi-plan language as happening now', () => {
  assert.equal(detectSafeTimelineCapture("I'm going out today at 8 PM then I'll pick up my daughter at 5 PM"), null)
  assert.equal(detectSafeTimelineCapture("I'm going to CEP tomorrow"), null)
})

test('still recognizes clear current and completed activity statements', () => {
  assert.deepEqual(detectSafeTimelineCapture("I'm making lunch"), { type: 'doing_now', text: 'making lunch' })
  assert.deepEqual(detectSafeTimelineCapture('I just called my daughter'), { type: 'did', text: 'called my daughter' })
})

test('asks one clarification for an ambiguous spoken time range', () => {
  assert.deepEqual(
    ambiguousTimeRangeClarification('CEP from 9 to 230 then get ready tomorrow'),
    {
      question: 'Did you mean 9:00 AM to 2:30 PM?',
      suggestedMessage: 'CEP from 9:00 AM to 2:30 PM then get ready tomorrow',
    },
  )
})

test('separates sequential plans and assigns tomorrow locally', () => {
  assert.deepEqual(splitPlanClauses('CEP from 9 to 2:30, then get ready for carpet install tomorrow'), [
    'CEP from 9 to 2:30',
    'get ready for carpet install tomorrow',
  ])
  assert.equal(plannedDateForText('get ready tomorrow', '2026-08-31'), '2026-09-01')
})

test('counts the participant-facing processing limit in words, not characters', () => {
  assert.equal(countPlanWords('  CEP from 9 to 2:30  '), 5)
  assert.equal(countPlanWords(''), 0)
})
