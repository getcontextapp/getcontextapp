import assert from 'node:assert/strict'
import test from 'node:test'
import { addDaysToKey, formatTaskTiming, nextOccurrenceDate, periodForTime, repeatRuleIncludesDate } from './task-scheduling'
import { normalizedRepeatTaskText, repeatTaskKey } from './task-scheduling-server'

test('formats exact times and keeps broad periods when no time is present', () => {
  assert.equal(formatTaskTiming('15:00', 'afternoon'), '3:00 PM')
  assert.equal(formatTaskTiming(null, 'morning'), 'Morning')
})

test('maps exact times to the correct broad period', () => {
  assert.equal(periodForTime('11:59'), 'morning')
  assert.equal(periodForTime('12:00'), 'afternoon')
  assert.equal(periodForTime('17:00'), 'evening')
})

test('finds the next daily, weekday, and weekly occurrence', () => {
  assert.equal(nextOccurrenceDate('2026-06-12', 'daily'), '2026-06-13')
  assert.equal(nextOccurrenceDate('2026-06-12', 'weekdays'), '2026-06-15')
  assert.equal(nextOccurrenceDate('2026-06-12', 'weekly'), '2026-06-19')
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01')
})

test('detects whether a repeat series is due on a date', () => {
  assert.equal(repeatRuleIncludesDate('2026-07-01', '2026-07-12', 'daily'), true)
  assert.equal(repeatRuleIncludesDate('2026-07-01', '2026-07-11', 'weekdays'), false)
  assert.equal(repeatRuleIncludesDate('2026-07-01', '2026-07-13', 'weekdays'), true)
  assert.equal(repeatRuleIncludesDate('2026-07-01', '2026-07-08', 'weekly'), true)
  assert.equal(repeatRuleIncludesDate('2026-07-01', '2026-07-09', 'weekly'), false)
  assert.equal(repeatRuleIncludesDate('2026-07-01', '2026-06-30', 'daily'), false)
})

test('normalizes common repeat-task wording into one identity', () => {
  assert.equal(normalizedRepeatTaskText({ note: 'Go to the gym', label: 'Movement' }), 'gym')
  assert.equal(normalizedRepeatTaskText({ note: 'Go to gym', label: 'Movement' }), 'gym')
  assert.equal(normalizedRepeatTaskText({ note: 'Finish STHL coding', label: 'Other' }), 'sthl coding')
  assert.equal(normalizedRepeatTaskText({ note: 'STHL coding', label: 'Other' }), 'sthl coding')
})

test('uses normalized text and repeat cadence for repeat identity', () => {
  const base = {
    assigned_to: 'profile-1',
    created_by: 'profile-1',
    repeat_rule: 'daily' as const,
    label: 'Movement',
  }
  assert.equal(
    repeatTaskKey({ ...base, note: 'Go to the gym' }),
    repeatTaskKey({ ...base, note: 'Go to gym' }),
  )
  assert.notEqual(
    repeatTaskKey({ ...base, note: 'Go to the gym' }),
    repeatTaskKey({ ...base, note: 'Go to the gym', repeat_rule: 'weekly' }),
  )
})
