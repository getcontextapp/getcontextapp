import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildResearchFollowupMessage,
  buildSmsComposeHref,
  chooseResearchFollowupRecipient,
  firstName,
  isResearchFollowupDay,
  researchStudyDay,
  RESEARCH_FOLLOWUP_DAYS,
} from './research-followup'

test('uses the participant for a solo household and the care partner for a shared household', () => {
  const participant = { id: 'mci', role: 'mci_user' }
  const carePartner = { id: 'cp', role: 'care_partner' }
  assert.equal(chooseResearchFollowupRecipient([participant]), participant)
  assert.equal(chooseResearchFollowupRecipient([participant, carePartner]), carePartner)
  assert.equal(chooseResearchFollowupRecipient([]), null)
})

test('uses only the recipient first name in the fixed research message', () => {
  const message = buildResearchFollowupMessage('Linda Example', 5)
  assert.match(message, /^Hi Linda, this is Ibrahim from the Context memory-support app research team\./)
  assert.match(message, /Day 5 of the pilot/)
  assert.match(message, /quick text chat or short phone call at a convenient time today/)
  assert.doesNotMatch(message, /remind|supervise|check on your partner/i)
})

test('defines the approved follow-up milestones', () => {
  assert.deepEqual(RESEARCH_FOLLOWUP_DAYS, [2, 5, 10, 14])
  assert.equal(isResearchFollowupDay(5), true)
  assert.equal(isResearchFollowupDay(7), false)
  assert.equal(isResearchFollowupDay(15), false)
})

test('falls back safely when the display name is blank', () => {
  assert.equal(firstName('   '), 'there')
})

test('matches the dashboard study day at UTC date boundaries', () => {
  assert.equal(researchStudyDay('2026-08-24T23:50:00Z', '2026-08-28T00:01:00Z'), 5)
  assert.equal(researchStudyDay('2026-08-28T00:01:00Z', '2026-08-28T23:59:00Z'), 1)
})

test('builds personal Messages links for iPhone and Android', () => {
  const message = 'Hi Linda, quick text chat?'
  assert.equal(
    buildSmsComposeHref('+15551234567', message, true),
    'sms:+15551234567&body=Hi%20Linda%2C%20quick%20text%20chat%3F',
  )
  assert.equal(
    buildSmsComposeHref('+15551234567', message, false),
    'sms:+15551234567?body=Hi%20Linda%2C%20quick%20text%20chat%3F',
  )
})
