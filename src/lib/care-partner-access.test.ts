import test from 'node:test'
import assert from 'node:assert/strict'
import { canManageParticipantSchedule } from './care-partner-access'
import type { Profile } from '@/types'

function profile(patch: Partial<Profile>): Profile {
  return {
    id: 'participant', user_id: 'user', role: 'mci_user', display_name: 'Pat', phone_e164: null,
    household_id: 'home', reminder_gap_minutes: 90, daily_summary_time: '20:00',
    timezone: 'America/New_York', created_at: new Date(0).toISOString(), ...patch,
  }
}

test('participant always manages their own schedule', () => {
  const participant = profile({ care_partner_calendar_management: false })
  assert.equal(canManageParticipantSchedule(participant, participant), true)
})

test('care partner is view-only until participant enables management', () => {
  const carePartner = profile({ id: 'cp', user_id: 'cp-user', role: 'care_partner' })
  assert.equal(canManageParticipantSchedule(carePartner, profile({ care_partner_calendar_management: false })), false)
  assert.equal(canManageParticipantSchedule(carePartner, profile({ care_partner_calendar_management: true })), true)
})

test('permission never crosses households', () => {
  const carePartner = profile({ id: 'cp', user_id: 'cp-user', role: 'care_partner', household_id: 'other-home' })
  assert.equal(canManageParticipantSchedule(carePartner, profile({ care_partner_calendar_management: true })), false)
})
