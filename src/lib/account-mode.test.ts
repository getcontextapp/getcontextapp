import assert from 'node:assert/strict'
import test from 'node:test'
import { accountModeForMembers } from './account-mode'

test('a household with only the primary participant is solo', () => {
  assert.equal(accountModeForMembers([{ role: 'mci_user' }]), 'solo')
})

test('a household becomes shared when a care partner joins', () => {
  assert.equal(accountModeForMembers([{ role: 'mci_user' }, { role: 'care_partner' }]), 'shared')
})
