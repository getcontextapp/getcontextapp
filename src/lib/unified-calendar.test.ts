import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUnifiedCalendarItems, monthGrid, startOfWeek } from './unified-calendar'
import type { CalendarEvent, PlannedActivity } from '@/types'

test('merges sources and removes a linked Context duplicate', () => {
  const event = { id: 'e1', title: 'Dentist', starts_at: '2026-09-18T14:00:00Z', all_day: false, location: null } as CalendarEvent
  const plan = { id: 'p1', label: 'Dentist', note: null, planned_for: '2026-09-18', expected_time: '10:00:00', expected_period: 'morning', status: 'planned' } as PlannedActivity
  const items = buildUnifiedCalendarItems({ events: [event], plans: [plan], linkedPlanIds: ['p1'], timeZone: 'America/New_York' })
  assert.equal(items.length, 1)
  assert.equal(items[0].source, 'google')
})

test('builds Sunday-first week and six-row month grid', () => {
  assert.equal(startOfWeek('2026-09-18'), '2026-09-13')
  const grid = monthGrid('2026-09-18')
  assert.equal(grid.length, 42)
  assert.equal(grid[0], '2026-08-30')
})
