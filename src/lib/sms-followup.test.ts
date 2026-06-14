import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldSendCarePartnerAlert, shouldSendMorningFollowup } from './sms-followup'

test('morning follow-up stops after any engagement or an earlier follow-up', () => {
  assert.equal(shouldSendMorningFollowup(10, false, false), true)
  assert.equal(shouldSendMorningFollowup(10, true, false), false)
  assert.equal(shouldSendMorningFollowup(10, false, true), false)
  assert.equal(shouldSendMorningFollowup(12, false, false), false)
})

test('care-partner no-response alert is limited to one unengaged alert after noon', () => {
  assert.equal(shouldSendCarePartnerAlert(12, false, false), true)
  assert.equal(shouldSendCarePartnerAlert(16, true, false), false)
  assert.equal(shouldSendCarePartnerAlert(16, false, true), false)
  assert.equal(shouldSendCarePartnerAlert(11, false, false), false)
})
