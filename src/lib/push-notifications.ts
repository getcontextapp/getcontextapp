import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationCategory =
  | 'test' | 'morning' | 'due' | 'reentry' | 'summary' | 'calendar' | 'care_partner' | 'admin'

export type PushNotificationInput = {
  profileId: string
  userId: string
  householdId: string | null
  category: NotificationCategory
  title: string
  body: string
  url: string
  dedupeKey?: string | null
  metadata?: Record<string, unknown>
}

export function pushConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? ''
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? ''
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@getcontextapp.com'
  return { publicKey, privateKey, subject, configured: Boolean(publicKey && privateKey) }
}

export function shouldDisablePushSubscription(statusCode: number) {
  return statusCode === 404 || statusCode === 410
}

export function isAllowedPushEndpoint(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com')
  } catch {
    return false
  }
}

export async function sendPushNotification(supabase: SupabaseClient, input: PushNotificationInput) {
  const config = pushConfiguration()
  if (!config.configured) return { sent: 0, failed: 0, unavailable: true }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)

  const [{ data: preferences }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
    supabase.from('notification_preferences').select('push_enabled').eq('profile_id', input.profileId).maybeSingle(),
    supabase.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth_key,failure_count')
      .eq('profile_id', input.profileId)
      .eq('enabled', true),
  ])
  if (subscriptionError) throw new Error(subscriptionError.message)
  if (!preferences?.push_enabled) return { sent: 0, failed: 0, disabled: true }
  if (!subscriptions?.length) return { sent: 0, failed: 0, noSubscription: true }

  const { data: existing } = input.dedupeKey
    ? await supabase.from('notification_events').select('id').eq('dedupe_key', input.dedupeKey).maybeSingle()
    : { data: null }
  if (existing) return { sent: 0, failed: 0, duplicate: true }

  const { data: event, error: eventError } = await supabase
    .from('notification_events')
    .insert({
      profile_id: input.profileId,
      user_id: input.userId,
      household_id: input.householdId,
      category: input.category,
      title: input.title,
      body: input.body,
      url: input.url,
      dedupe_key: input.dedupeKey ?? null,
      channels: ['push'],
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single()
  if (eventError || !event) throw new Error(eventError?.message ?? 'Could not create notification event.')

  const payload = JSON.stringify({
    eventId: event.id,
    title: input.title,
    body: input.body,
    url: input.url,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  })
  let sent = 0
  let failed = 0

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      }, payload, { TTL: 300 })
      sent++
      await supabase.from('push_subscriptions').update({
        failure_count: 0,
        last_success_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', subscription.id)
    } catch (error) {
      failed++
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0
      await supabase.from('push_subscriptions').update({
        enabled: !shouldDisablePushSubscription(statusCode),
        failure_count: subscription.failure_count + 1,
        last_failure_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', subscription.id)
    }
  }

  await supabase.from('notification_events').update({
    sent_at: sent > 0 ? new Date().toISOString() : null,
    delivery_status: { push: { sent, failed } },
  }).eq('id', event.id)

  return { sent, failed, eventId: event.id }
}
