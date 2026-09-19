import test from 'node:test'
import assert from 'node:assert/strict'
import { isLikelyDuplicate } from './duplicate-detection'

test('matches exact same-time tasks', () => {
  assert.equal(isLikelyDuplicate({ title: 'Doctor appointment', planned_for: '2026-09-19', expected_time: '09:00' }, { id: '1', title: 'Doctor appointment', source: 'Google Calendar', planned_for: '2026-09-19', expected_time: '09:00' }), true)
})

test('matches similar same-time titles but not different times', () => {
  const input = { title: 'Call the pharmacy', planned_for: '2026-09-19', expected_time: '14:00' }
  assert.equal(isLikelyDuplicate(input, { id: '1', title: 'Call pharmacy', source: 'Context', planned_for: '2026-09-19', expected_time: '14:00' }), true)
  assert.equal(isLikelyDuplicate(input, { id: '2', title: 'Call pharmacy', source: 'Context', planned_for: '2026-09-19', expected_time: '15:00' }), false)
})
