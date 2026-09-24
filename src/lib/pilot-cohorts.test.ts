import assert from 'node:assert/strict'
import test from 'node:test'
import { cohortForHouseholdName, isHouseholdExcludedFromPilotAnalytics } from './pilot-cohorts'

test('places the three named households in internal preview', () => {
  for (const name of ['My Home', 'The Odu Household', 'Baru Home']) {
    assert.deepEqual(cohortForHouseholdName(name), { cohort: 'internal', prefix: 'I' })
  }
})

test('normalizes household name casing and spacing', () => {
  assert.equal(cohortForHouseholdName('  THE   ODU HOUSEHOLD  ').cohort, 'internal')
})

test('places every other household in participant pilot', () => {
  for (const name of ['Davis Home', 'Bilau Family', 'A New Household', 'My Home 2']) {
    assert.deepEqual(cohortForHouseholdName(name), { cohort: 'pilot-1', prefix: 'P' })
  }
})

test('excludes non-participant households from every pilot analytics rollup', () => {
  for (const name of ['Go Stroh', 'Google OAuth Review', '  GOOGLE   OAUTH REVIEW  ']) {
    assert.equal(isHouseholdExcludedFromPilotAnalytics(name), true)
  }

  assert.equal(isHouseholdExcludedFromPilotAnalytics('A Real Participant'), false)
})
