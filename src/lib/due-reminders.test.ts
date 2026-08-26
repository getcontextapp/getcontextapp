import assert from 'node:assert/strict'
import test from 'node:test'
import { dueReminderCopy, dueReminderDetail, isDueReminderWindow, localDateAndMinute, parseExpectedTime } from './due-reminders'

test('parses valid 24-hour times and rejects malformed values', () => {
  assert.equal(parseExpectedTime('09:00'), 540)
  assert.equal(parseExpectedTime('23:59'), 1439)
  assert.equal(parseExpectedTime('24:00'), null)
  assert.equal(parseExpectedTime('9:00'), null)
  assert.equal(parseExpectedTime(null), null)
})

test('matches only the short window after an exact due time', () => {
  assert.equal(isDueReminderWindow('09:00', 540), true)
  assert.equal(isDueReminderWindow('09:00', 549), true)
  assert.equal(isDueReminderWindow('09:00', 550), false)
  assert.equal(isDueReminderWindow('09:00', 539), false)
})

test('derives the recipient local date and time', () => {
  const instant = new Date('2026-08-26T13:05:00.000Z')
  assert.deepEqual(localDateAndMinute(instant, 'America/New_York'), {
    dateKey: '2026-08-26',
    minuteOfDay: 9 * 60 + 5,
  })
  assert.deepEqual(localDateAndMinute(instant, 'not/a-zone'), {
    dateKey: '2026-08-26',
    minuteOfDay: 13 * 60 + 5,
  })
})

test('keeps lock-screen copy private unless details are enabled', () => {
  assert.equal(dueReminderCopy('Call the pharmacy', false).pushBody, 'Something in your Context plan is due now.')
  assert.equal(dueReminderCopy('Call the pharmacy', true).pushBody, 'Call the pharmacy is due now.')
})

test('uses a calendar title instead of its location as the due detail', () => {
  assert.equal(dueReminderDetail({ category: 'custom', label: 'Doctor appointment', note: 'Main Street Clinic' }), 'Doctor appointment')
  assert.equal(dueReminderDetail({ category: 'meal', label: 'Meal', note: 'Make lunch' }), 'Make lunch')
})
