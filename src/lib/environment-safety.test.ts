import assert from 'node:assert/strict'
import test from 'node:test'
import { stagingPushAllowed, stagingSmsAllowed } from './environment-safety'

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

test('production delivery is unchanged', () => {
  const original = process.env.CONTEXT_ENV
  process.env.CONTEXT_ENV = 'production'
  assert.equal(stagingSmsAllowed('+15555550100'), true)
  assert.equal(stagingPushAllowed('any-user'), true)
  restore('CONTEXT_ENV', original)
})

test('staging blocks delivery unless explicitly allowlisted', () => {
  const originalEnvironment = process.env.CONTEXT_ENV
  const originalPhones = process.env.STAGING_SMS_ALLOWLIST
  const originalUsers = process.env.STAGING_PUSH_USER_ALLOWLIST
  process.env.CONTEXT_ENV = 'staging'
  process.env.STAGING_SMS_ALLOWLIST = '+15555550100'
  process.env.STAGING_PUSH_USER_ALLOWLIST = 'demo-user'
  assert.equal(stagingSmsAllowed('(555) 555-0100'), true)
  assert.equal(stagingSmsAllowed('+15555550101'), false)
  assert.equal(stagingPushAllowed('demo-user'), true)
  assert.equal(stagingPushAllowed('participant-user'), false)
  restore('CONTEXT_ENV', originalEnvironment)
  restore('STAGING_SMS_ALLOWLIST', originalPhones)
  restore('STAGING_PUSH_USER_ALLOWLIST', originalUsers)
})
