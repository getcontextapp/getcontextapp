// ─── Database / Domain Types ──────────────────────────────────────────────────

export type UserRole = 'mci_user' | 'care_partner'

export interface Profile {
  id: string
  user_id: string
  role: UserRole
  display_name: string
  phone_e164: string | null
  household_id: string | null
  reminder_gap_minutes: number   // minutes between SMS nudges while planned activity is pending
  daily_summary_time: string     // HH:MM in user local time, e.g. "20:00"
  timezone: string               // IANA tz string
  created_at: string
}

export interface Household {
  id: string
  join_code: string              // 6-char alphanumeric
  name: string
  created_at: string
}

export type ActivityCategory =
  | 'morning'
  | 'meal'
  | 'movement'
  | 'social'
  | 'rest'
  | 'medication'
  | 'custom'

export interface ActivityLog {
  id: string
  household_id: string
  logged_by: string              // profile.id
  category: ActivityCategory
  label: string                  // e.g. "Breakfast", "Walk with dog"
  note: string | null
  occurred_at: string            // ISO timestamp
  created_at: string
}

export type PlannedActivityStatus = 'planned' | 'confirmed' | 'not_now' | 'skipped'
export type ExpectedPeriod = 'morning' | 'afternoon' | 'evening' | 'anytime'
export type PlannedActivitySource = 'manual' | 'sms_ai'

export interface PlannedActivity {
  id: string
  household_id: string
  created_by: string
  assigned_to: string | null
  category: ActivityCategory
  label: string
  note: string | null
  expected_period: ExpectedPeriod
  expected_time: string | null
  planned_for: string
  status: PlannedActivityStatus
  confirmed_activity_log_id: string | null
  confirmed_at: string | null
  source: PlannedActivitySource
  created_at: string
  updated_at: string
}

export interface ContextCard {
  id: string
  household_id: string
  activity_log_id: string | null
  type: 'open' | 'reentry'
  title: string
  body: string                   // markdown-lite; rendered with whitespace-pre-line
  generated_by: 'ai' | 'user'
  is_active: boolean
  created_at: string
}

export interface ReminderLog {
  id: string
  household_id: string
  profile_id: string
  type: 'reentry' | 'daily_summary'
  sent_at: string
  twilio_sid: string | null
  status: 'sent' | 'delivered' | 'failed'
}

export type SmsDirection = 'inbound' | 'outbound'
export type SmsPurpose =
  | 'welcome'
  | 'morning_prompt'
  | 'morning_followup'
  | 'care_partner_no_response'
  | 'pending_reminder'
  | 'daily_summary'
  | 'inbound_plan_reply'
  | 'inbound_confirmation'
  | 'inbound_other'

export interface SmsMessage {
  id: string
  household_id: string | null
  profile_id: string | null
  direction: SmsDirection
  purpose: SmsPurpose
  phone_e164: string
  body: string
  twilio_sid: string | null
  status: string
  metadata: Record<string, unknown>
  created_at: string
}

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface LogActivityPayload {
  category: ActivityCategory
  label: string
  note?: string
  occurred_at?: string
}

export interface CreatePlannedActivityPayload {
  category: ActivityCategory
  label: string
  note?: string
  expected_period: ExpectedPeriod
  expected_time?: string | null
  planned_for?: string
}

export interface ParsedSmsPlanItem {
  category: ActivityCategory
  note: string
  expected_period: ExpectedPeriod
  confidence: 'high' | 'medium' | 'low'
}

export interface ParsedSmsPlanReply {
  intent:
    | 'plan'
    | 'completed'
    | 'confirmation'
    | 'pending_status'
    | 'pending_action'
    | 'undo_request'
    | 'delete_request'
    | 'unclear'
  items: ParsedSmsPlanItem[]
  confirmation?: 'yes' | 'not_now' | 'skip' | null
  selected_numbers?: number[] | 'all'
  reply: string
}

export interface GenerateReentryCardPayload {
  activity_log_id: string
  context_snapshot: string       // recent activity labels joined
}

export interface LinkHouseholdPayload {
  join_code: string
}

export interface CreateHouseholdPayload {
  name: string
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

export interface ActivityTileConfig {
  category: ActivityCategory
  icon: string      // emoji
  label: string
  colorClass: string
  suggestions: string[]
}

export const ACTIVITY_TILES: ActivityTileConfig[] = [
  {
    category: 'morning',
    icon: '🌤',
    label: 'Morning',
    colorClass: 'tile-morning',
    suggestions: ['Wash up', 'Get dressed', 'Have coffee or tea', 'Check today\'s plan'],
  },
  {
    category: 'meal',
    icon: '🍽',
    label: 'Meal',
    colorClass: 'tile-meal',
    suggestions: ['Breakfast', 'Lunch', 'Dinner', 'Snack or drink'],
  },
  {
    category: 'movement',
    icon: '🚶',
    label: 'Movement',
    colorClass: 'tile-movement',
    suggestions: ['Walk outside', 'Stretch', 'Exercise class', 'Work in the yard'],
  },
  {
    category: 'social',
    icon: '💬',
    label: 'Social',
    colorClass: 'tile-social',
    suggestions: ['Phone call', 'Family visit', 'Talk with a neighbor', 'Video call'],
  },
  {
    category: 'rest',
    icon: '🛋',
    label: 'Rest',
    colorClass: 'tile-rest',
    suggestions: ['Take a nap', 'Quiet reading', 'Rest for a while', 'Watch TV'],
  },
  {
    category: 'medication',
    icon: '💊',
    label: 'Medication',
    colorClass: 'tile-medication',
    suggestions: ['Morning pills', 'Afternoon pills', 'Evening pills', 'Vitamins or supplements'],
  },
  {
    category: 'custom',
    icon: '✏️',
    label: 'Other',
    colorClass: 'tile-custom',
    suggestions: ['Household task', 'Personal care', 'Appointment', 'Hobby or activity'],
  },
]
