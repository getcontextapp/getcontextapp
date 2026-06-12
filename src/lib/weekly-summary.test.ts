import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWeeklySummary, getActivityPeriod, getLastCompletedWeek } from './weekly-summary'
import type { ActivityLog, PlannedActivity } from '@/types'

const householdId = 'household-test'
const profileId = 'profile-test'

function plan(overrides: Partial<PlannedActivity> = {}): PlannedActivity {
  return {
    id: 'plan-1',
    household_id: householdId,
    created_by: profileId,
    assigned_to: profileId,
    category: 'movement',
    label: 'Movement',
    note: 'Take a walk',
    expected_period: 'anytime',
    expected_time: null,
    planned_for: '2026-06-01',
    status: 'planned',
    confirmed_activity_log_id: null,
    confirmed_at: null,
    source: 'manual',
    created_at: '2026-06-01T12:00:00Z',
    updated_at: '2026-06-01T12:00:00Z',
    ...overrides,
  }
}

function activity(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: 'activity-1',
    household_id: householdId,
    logged_by: profileId,
    category: 'movement',
    label: 'Movement',
    note: 'Take a walk',
    occurred_at: '2026-06-01T12:00:00Z',
    created_at: '2026-06-01T12:00:00Z',
    ...overrides,
  }
}

test('uses the last completed Sunday through Saturday in the profile timezone', () => {
  assert.deepEqual(
    getLastCompletedWeek(new Date('2026-06-12T15:00:00Z'), 'America/New_York'),
    { startKey: '2026-05-31', endKey: '2026-06-06' },
  )
})

test('places marked-done timestamps in local morning, afternoon, and evening buckets', () => {
  assert.equal(getActivityPeriod('2026-06-01T15:59:00Z', 'America/New_York'), 'Morning')
  assert.equal(getActivityPeriod('2026-06-01T16:00:00Z', 'America/New_York'), 'Afternoon')
  assert.equal(getActivityPeriod('2026-06-01T20:59:00Z', 'America/New_York'), 'Afternoon')
  assert.equal(getActivityPeriod('2026-06-01T21:00:00Z', 'America/New_York'), 'Evening')
  assert.equal(getActivityPeriod('2026-06-01T04:00:00Z', 'America/New_York'), 'Morning')
})

test('calculates status totals from plans and activity analytics from deduplicated logs', () => {
  const plans = [
    plan({
      id: 'plan-completed',
      status: 'confirmed',
      confirmed_activity_log_id: 'activity-linked',
      confirmed_at: '2026-06-01T18:00:00Z',
    }),
    plan({ id: 'plan-waiting', status: 'planned' }),
    plan({ id: 'plan-later', status: 'not_now' }),
    plan({ id: 'plan-skipped', status: 'skipped' }),
  ]
  const activities = [
    activity({ id: 'activity-linked', occurred_at: '2026-06-01T18:00:00Z' }),
    activity({ id: 'activity-duplicate', occurred_at: '2026-06-01T18:01:00Z' }),
  ]

  const summary = buildWeeklySummary(
    plans,
    activities,
    'America/New_York',
    '2026-05-31',
    '2026-06-06',
  )

  assert.equal(summary.totalPlanned, 4)
  assert.equal(summary.completed, 1)
  assert.equal(summary.notCompleted, 2)
  assert.equal(summary.skipped, 1)
  assert.equal(summary.completionRate, 25)
  assert.equal(summary.activityCount, 1)
  assert.deepEqual(summary.periods.map(item => item.count), [0, 1, 0])
})

test('does not let activity timestamps outside the completed week affect analytics', () => {
  const summary = buildWeeklySummary(
    [plan({
      status: 'confirmed',
      confirmed_at: '2026-06-07T22:00:00Z',
      updated_at: '2026-06-07T22:00:00Z',
    })],
    [activity({ occurred_at: '2026-06-07T22:00:00Z' })],
    'America/New_York',
    '2026-05-31',
    '2026-06-06',
  )

  assert.equal(summary.completed, 1)
  assert.equal(summary.activityCount, 0)
  assert.deepEqual(summary.periods.map(item => item.count), [0, 0, 0])
})
