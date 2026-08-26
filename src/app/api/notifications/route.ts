import { NextRequest, NextResponse } from 'next/server'
import { getNotificationContext } from '@/lib/notification-auth'
import { pushConfiguration } from '@/lib/push-notifications'

const DEFAULT_CATEGORIES = {
  morning: true,
  due: true,
  reentry: true,
  summary: true,
  calendar: true,
  care_partner: true,
}

export async function GET() {
  const context = await getNotificationContext()
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  if (!context.eligible) return NextResponse.json({ eligible: false })

  const [preferencesResult, subscriptionsResult, eventsResult] = await Promise.all([
    context.service.from('notification_preferences').select('*').eq('profile_id', context.profile.id).maybeSingle(),
    context.service.from('push_subscriptions').select('id').eq('profile_id', context.profile.id).eq('enabled', true),
    context.service.from('notification_events')
      .select('id,category,title,body,url,sent_at,read_at,created_at')
      .eq('profile_id', context.profile.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  const error = preferencesResult.error || subscriptionsResult.error || eventsResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const preferences = preferencesResult.data ?? {
    push_enabled: false,
    sms_enabled: true,
    detailed_content: false,
    quiet_start: '20:00',
    quiet_end: '08:00',
    categories: DEFAULT_CATEGORIES,
  }

  return NextResponse.json({
    eligible: true,
    configured: pushConfiguration().configured,
    publicKey: pushConfiguration().publicKey,
    preferences,
    subscriptionCount: subscriptionsResult.data?.length ?? 0,
    events: eventsResult.data ?? [],
  })
}

export async function PATCH(request: NextRequest) {
  const context = await getNotificationContext()
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  if (!context.eligible) return NextResponse.json({ error: 'Notifications are not enabled for this household.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  if (body.action === 'mark_read' && typeof body.eventId === 'string') {
    const { error } = await context.service.from('notification_events').update({ read_at: new Date().toISOString() })
      .eq('id', body.eventId).eq('profile_id', context.profile.id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  if (body.action === 'mark_all_read') {
    const { error } = await context.service.from('notification_events').update({ read_at: new Date().toISOString() })
      .eq('profile_id', context.profile.id).is('read_at', null)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.pushEnabled === 'boolean') patch.push_enabled = body.pushEnabled
  if (typeof body.smsEnabled === 'boolean') patch.sms_enabled = body.smsEnabled
  if (typeof body.detailedContent === 'boolean') patch.detailed_content = body.detailedContent

  const { data: existingPreferences } = await context.service.from('notification_preferences')
    .select('categories').eq('profile_id', context.profile.id).maybeSingle()
  const { data, error } = await context.service.from('notification_preferences').upsert({
    profile_id: context.profile.id,
    user_id: context.user.id,
    household_id: context.profile.household_id,
    categories: existingPreferences?.categories ?? DEFAULT_CATEGORIES,
    ...patch,
  }, { onConflict: 'profile_id' }).select('*').single()
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ preferences: data })
}
