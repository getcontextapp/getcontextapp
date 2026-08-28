import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePilotInterestSubmission } from './pilot-interest'

test('normalizes a valid pilot interest submission', () => {
  const result = parsePilotInterestSubmission({
    name: '  Linda Fowler ',
    email: ' LINDA@EXAMPLE.COM ',
    phone: ' 404-555-0100 ',
    role: 'person_with_memory_changes',
    source: 'landing_home',
  })

  assert.deepEqual(result, {
    ok: true,
    submission: {
      name: 'Linda Fowler',
      email: 'linda@example.com',
      phone: '404-555-0100',
      role: 'person_with_memory_changes',
      source: 'landing_home',
    },
  })
})

test('rejects missing, invalid, or unsupported pilot interest fields', () => {
  assert.deepEqual(parsePilotInterestSubmission({ name: '', email: 'bad', role: 'care_partner' }), { ok: false })
  assert.deepEqual(parsePilotInterestSubmission({ name: 'Pat', email: 'pat@example.com', role: 'other' }), { ok: false })
})
