import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractPlanUpdateTarget,
  findPlanUpdateIntent,
  isPlanTimeUpdateMessage,
  parsePlanUpdateTime,
} from './plan-update-intent'
import type { PlannedActivity } from '@/types'

function activity(patch: Partial<PlannedActivity>): PlannedActivity {
  return {
    id: patch.id ?? 'task-1',
    household_id: 'house-1',
    created_by: 'profile-1',
    assigned_to: 'profile-1',
    category: 'custom',
    label: 'Other',
    note: patch.note ?? 'Go yo church',
    expected_period: patch.expected_period ?? 'anytime',
    expected_time: patch.expected_time ?? null,
    repeat_rule: patch.repeat_rule ?? 'none',
    series_id: patch.series_id ?? null,
    moved_from_id: null,
    planned_for: patch.planned_for ?? '2026-08-16',
    status: patch.status ?? 'planned',
    confirmed_activity_log_id: null,
    confirmed_at: null,
    source: patch.source ?? 'manual',
    created_at: patch.created_at ?? '2026-08-16T10:00:00.000Z',
    updated_at: patch.updated_at ?? '2026-08-16T10:00:00.000Z',
  }
}

test('detects a natural time update as an edit intent', () => {
  assert.equal(isPlanTimeUpdateMessage('Update the time for church to 1pm pst'), true)
  assert.equal(parsePlanUpdateTime('Update the time for church to 1pm pst'), '13:00')
  assert.equal(extractPlanUpdateTarget('Update the time for church to 1pm pst'), 'church')
})

test('does not treat a normal plan as a task edit', () => {
  assert.equal(isPlanTimeUpdateMessage('Go to church at 1pm'), false)
})

test('matches a target against an existing task with a typo', () => {
  const intent = findPlanUpdateIntent('Update the time for church to 1pm pst', [
    activity({ id: 'church', note: 'Go yo church' }),
    activity({ id: 'gym', note: 'Go to the gym' }),
  ])

  assert.equal(intent?.activity.id, 'church')
  assert.equal(intent?.expected_time, '13:00')
  assert.equal(intent?.expected_period, 'afternoon')
})

test('matches short target phrases in change wording', () => {
  const intent = findPlanUpdateIntent('Change gym to 6pm', [
    activity({ id: 'church', note: 'Go yo church' }),
    activity({ id: 'gym', note: 'Go to the gym' }),
  ])

  assert.equal(intent?.activity.id, 'gym')
  assert.equal(intent?.expected_time, '18:00')
  assert.equal(intent?.expected_period, 'evening')
})

test('returns null when the edit target is ambiguous', () => {
  const intent = findPlanUpdateIntent('Set drive to 4pm', [
    activity({ id: 'drive-1', note: 'Drive' }),
    activity({ id: 'drive-2', note: 'Drive to pharmacy' }),
  ])

  assert.equal(intent, null)
})
