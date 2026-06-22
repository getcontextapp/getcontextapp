import assert from 'node:assert/strict'
import test from 'node:test'
import { isRecallRequest } from './recall-intent'

test('recognizes confusion as a recall request', () => {
  assert.equal(isRecallRequest("I don't know"), true)
  assert.equal(isRecallRequest('I forgot.'), true)
  assert.equal(isRecallRequest('What was I doing?'), true)
})

test('does not treat ordinary planning uncertainty as recall', () => {
  assert.equal(isRecallRequest("I don't know if I can go to the gym"), false)
  assert.equal(isRecallRequest('I forgot to call tomorrow'), false)
})
