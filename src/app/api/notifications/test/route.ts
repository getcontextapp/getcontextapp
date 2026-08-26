import { NextResponse } from 'next/server'
import { getNotificationContext } from '@/lib/notification-auth'
import { sendPushNotification } from '@/lib/push-notifications'

export async function POST() {
  const context = await getNotificationContext()
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  if (!context.eligible) return NextResponse.json({ error: 'Notifications are not enabled for this household.' }, { status: 403 })

  const result = await sendPushNotification(context.service, {
    profileId: context.profile.id,
    userId: context.user.id,
    householdId: context.profile.household_id,
    category: 'test',
    title: 'Context notifications are ready',
    body: 'This is a gentle test. You can return to Context when you are ready.',
    url: context.profile.role === 'care_partner' ? '/care-partner' : '/mci-user',
    metadata: { requested_by_profile: context.profile.id },
  })
  if ('unavailable' in result) return NextResponse.json({ error: 'Push delivery is not configured yet.' }, { status: 503 })
  if (result.sent === 0) return NextResponse.json({ error: 'No active device subscription was found.' }, { status: 409 })
  return NextResponse.json(result)
}
