import assert from 'node:assert/strict'
import test from 'node:test'
import { ANALYTICS_PAGE_SIZE, matchPromptReplies, paginatedSelect } from './pilot-analytics-helpers'

test('pagination loads every page beyond the API row cap', async () => {
  const source = Array.from({ length: 2505 }, (_, id) => ({ id }))
  const result = await paginatedSelect<{ id: number }>(async (from, to) => ({
    data: source.slice(from, to + 1),
    error: null,
  }))
  assert.equal(ANALYTICS_PAGE_SIZE, 1000)
  assert.equal(result.error, null)
  assert.equal(result.data?.length, 2505)
  assert.equal(result.data?.at(-1)?.id, 2504)
})

test('pagination surfaces a later-page error instead of returning a false zero', async () => {
  const result = await paginatedSelect<{ id: number }>(async (from) => from === 0
    ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
    : { data: null, error: { code: '42501', message: 'permission denied' } })
  assert.equal(result.data, null)
  assert.equal(result.error?.code, '42501')
})

test('one SMS reply answers only the most recent unmatched prompt within 24 hours', () => {
  const purposes = new Set(['morning_prompt', 'pending_reminder'])
  const result = matchPromptReplies([
    { id: 'old', profile_id: 'p1', direction: 'outbound', purpose: 'morning_prompt', created_at: '2026-09-01T08:00:00Z' },
    { id: 'recent', profile_id: 'p1', direction: 'outbound', purpose: 'pending_reminder', created_at: '2026-09-01T12:00:00Z' },
    { id: 'reply', profile_id: 'p1', direction: 'inbound', purpose: 'inbound_other', created_at: '2026-09-01T12:10:00Z' },
  ], purposes)
  assert.equal(result.prompts, 2)
  assert.equal(result.answered, 1)
  assert.deepEqual(result.latencies, [10])
  assert.deepEqual([...result.matchedPromptIds], ['recent'])
})

test('user-initiated and late SMS messages are not counted as prompt replies', () => {
  const result = matchPromptReplies([
    { id: 'reply-first', profile_id: 'p1', direction: 'inbound', purpose: 'inbound_other', created_at: '2026-09-01T07:00:00Z' },
    { id: 'prompt', profile_id: 'p1', direction: 'outbound', purpose: 'morning_prompt', created_at: '2026-09-01T08:00:00Z' },
    { id: 'late', profile_id: 'p1', direction: 'inbound', purpose: 'inbound_other', created_at: '2026-09-02T09:00:01Z' },
  ], new Set(['morning_prompt']))
  assert.equal(result.answered, 0)
})
