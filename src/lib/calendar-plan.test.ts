import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarPlanAddedMessage, calendarPlanExistingMessage, isPlanForDisplayedDate } from './calendar-plan'

test('keeps a tomorrow calendar event out of the displayed today plan', () => {
  assert.equal(isPlanForDisplayedDate('2026-08-29', '2026-08-28'), false)
  assert.equal(isPlanForDisplayedDate('2026-08-28', '2026-08-28'), true)
})

test('confirms the date where a calendar event was added', () => {
  assert.equal(calendarPlanAddedMessage('2026-08-28', '2026-08-28'), "Added to today's Context plan.")
  assert.equal(calendarPlanAddedMessage('2026-08-29', '2026-08-28'), "Added to tomorrow's Context plan.")
  assert.equal(calendarPlanExistingMessage('2026-08-29', '2026-08-28'), "This is already in tomorrow's Context plan.")
})
