import assert from 'node:assert/strict'
import test from 'node:test'
import { nudgeRankCalendarDecision } from './nudge-rank'

test('suppresses a duplicate Context nudge for a source-calendar event', () => {
  assert.equal(nudgeRankCalendarDecision({
    calendarLinked: true,
    distinctCognitiveValue: false,
  }), 'suppress_source_calendar_duplicate')
})

test('allows non-calendar nudges and calendar nudges with distinct cognitive value', () => {
  assert.equal(nudgeRankCalendarDecision({
    calendarLinked: false,
    distinctCognitiveValue: false,
  }), 'send')
  assert.equal(nudgeRankCalendarDecision({
    calendarLinked: true,
    distinctCognitiveValue: true,
  }), 'send_distinct_cognitive_value')
})
