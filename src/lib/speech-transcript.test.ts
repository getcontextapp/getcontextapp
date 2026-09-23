import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeSpeechResults } from './speech-transcript'

test('replaces interim speech instead of appending it repeatedly', () => {
  const first = mergeSpeechResults({}, [{ isFinal: false, transcript: 'call Bill' }], 0)
  const second = mergeSpeechResults(first.finalSegments, [{ isFinal: false, transcript: 'call Bill tomorrow' }], 0)
  assert.equal(second.transcript, 'call Bill tomorrow')
})

test('suppresses Android-style repeated final segments', () => {
  const result = mergeSpeechResults({}, [
    { isFinal: true, transcript: 'connect with Bill' },
    { isFinal: true, transcript: 'connect with Bill' },
  ], 0)
  assert.equal(result.transcript, 'connect with Bill')
  assert.equal(result.duplicateSuppressed, true)
})

test('cleans repeated words inside one Android transcript', () => {
  const result = mergeSpeechResults({}, [{
    isFinal: true,
    transcript: 'connect with with Bill purchase purchase confirm confirm',
  }], 0)
  assert.equal(result.transcript, 'connect with Bill purchase confirm')
})
