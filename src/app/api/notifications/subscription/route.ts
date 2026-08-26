import { NextRequest, NextResponse } from 'next/server'
import { getNotificationContext } from '@/lib/notification-auth'
import { isAllowedPushEndpoint } from '@/lib/push-notifications'

type SubscriptionBody = {
  endpoint?: unknown
  expirationTime?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

export async function POST(request: NextRequest) {
  const context = await getNotificationContext()
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  if (!context.eligible) return NextResponse.json({ error: 'Notifications are not enabled for this household.' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as SubscriptionBody
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : ''
  const authKey = typeof body.keys?.auth === 'string' ? body.keys.auth : ''
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: 'Invalid push subscription endpoint.' }, { status: 400 })
  }
  if (!p256dh || !authKey) return NextResponse.json({ error: 'Push subscription keys are missing.' }, { status: 400 })

  const { data: endpointOwner } = await context.service.from('push_subscriptions')
    .select('profile_id').eq('endpoint', endpoint).maybeSingle()
  if (endpointOwner && endpointOwner.profile_id !== context.profile.id) {
    return NextResponse.json({ error: 'This device subscription belongs to another Context profile.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { error } = await context.service.from('push_subscriptions').upsert({
    profile_id: context.profile.id,
    user_id: context.user.id,
    household_id: context.profile.household_id,
    endpoint,
    p256dh,
    auth_key: authKey,
    expiration_time: typeof body.expirationTime === 'number' ? body.expirationTime : null,
    user_agent: request.headers.get('user-agent'),
    enabled: true,
    failure_count: 0,
    updated_at: now,
  }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await context.service.from('notification_preferences').upsert({
    profile_id: context.profile.id,
    user_id: context.user.id,
    household_id: context.profile.household_id,
    push_enabled: true,
    updated_at: now,
  }, { onConflict: 'profile_id' })

  return NextResponse.json({ subscribed: true })
}

export async function DELETE(request: NextRequest) {
  const context = await getNotificationContext()
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  const body = await request.json().catch(() => ({}))
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (endpoint) {
    await context.service.from('push_subscriptions').update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('endpoint', endpoint).eq('profile_id', context.profile.id)
  } else {
    await context.service.from('push_subscriptions').update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('profile_id', context.profile.id)
  }
  const { count } = await context.service.from('push_subscriptions')
    .select('id', { count: 'exact', head: true }).eq('profile_id', context.profile.id).eq('enabled', true)
  if ((count ?? 0) === 0) {
    await context.service.from('notification_preferences').upsert({
      profile_id: context.profile.id,
      user_id: context.user.id,
      household_id: context.profile.household_id,
      push_enabled: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' })
  }
  return NextResponse.json({ subscribed: false })
}
