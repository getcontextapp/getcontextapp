import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowedPushEndpoint, shouldDisablePushSubscription } from './push-notifications'

test('retires push subscriptions only when the push service says they are gone', () => {
  assert.equal(shouldDisablePushSubscription(404), true)
  assert.equal(shouldDisablePushSubscription(410), true)
  assert.equal(shouldDisablePushSubscription(429), false)
  assert.equal(shouldDisablePushSubscription(500), false)
})

test('accepts known browser push services and rejects arbitrary endpoints', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true)
  assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/QM/example'), true)
  assert.equal(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example'), true)
  assert.equal(isAllowedPushEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=example'), true)
  assert.equal(isAllowedPushEndpoint('https://example.com/internal-callback'), false)
  assert.equal(isAllowedPushEndpoint('http://localhost:3000/private'), false)
})
