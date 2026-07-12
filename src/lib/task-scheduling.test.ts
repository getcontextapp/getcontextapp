import assert from 'node:assert/strict'
import test from 'node:test'
import { addDaysToKey, formatTaskTiming, nextOccurrenceDate, periodForTime, repeatRuleIncludesDate } from './task-scheduling'

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
