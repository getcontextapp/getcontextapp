// ─── Database / Domain Types ──────────────────────────────────────────────────

export type UserRole = 'mci_user' | 'care_partner'

export interface Profile {
  id: string
  user_id: string
  role: UserRole
  display_name: string
  phone_e164: string | null
  household_id: string | null
  reminder_gap_minutes: number   // minutes before re-entry card SMS fires
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

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface LogActivityPayload {
  category: ActivityCategory
  label: string
  note?: string
  occurred_at?: string
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
    suggestions: ['Woke up', 'Showered', 'Got dressed', 'Morning coffee'],
  },
  {
    category: 'meal',
    icon: '🍽',
    label: 'Meal',
    colorClass: 'tile-meal',
    suggestions: ['Breakfast', 'Lunch', 'Dinner', 'Snack'],
  },
  {
    category: 'movement',
    icon: '🚶',
    label: 'Movement',
    colorClass: 'tile-movement',
    suggestions: ['Walk outside', 'Stretching', 'Exercise class', 'Gardening'],
  },
  {
    category: 'social',
    icon: '💬',
    label: 'Social',
    colorClass: 'tile-social',
    suggestions: ['Phone call', 'Visit with family', 'Neighbor chat', 'Video call'],
  },
  {
    category: 'rest',
    icon: '🛋',
    label: 'Rest',
    colorClass: 'tile-rest',
    suggestions: ['Nap', 'Quiet reading', 'Resting', 'TV time'],
  },
  {
    category: 'medication',
    icon: '💊',
    label: 'Medication',
    colorClass: 'tile-medication',
    suggestions: ['Morning medications', 'Evening medications', 'Supplements'],
  },
]
