import type { SupabaseClient } from '@supabase/supabase-js'

interface TrackEventInput {
  eventName: string
  properties?: Record<string, unknown>
  profile?: {
    id?: string | null
    user_id?: string | null
    household_id?: string | null
    role?: string | null
  } | null
  userId?: string | null
}

export async function trackEvent(
  supabase: SupabaseClient,
  { eventName, properties = {}, profile, userId }: TrackEventInput,
) {
  const resolvedUserId = userId ?? profile?.user_id ?? null

  if (!resolvedUserId) return

  const { error } = await supabase.from('analytics_events').insert({
    user_id: resolvedUserId,
    profile_id: profile?.id ?? null,
    household_id: profile?.household_id ?? null,
    role: profile?.role ?? null,
    event_name: eventName,
    properties,
  })

  if (error) {
    console.error('[Analytics] Track event failed:', error.message)
  }
}
