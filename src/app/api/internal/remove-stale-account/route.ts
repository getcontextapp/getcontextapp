import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

const TOKEN_HASH = 'cd2e51f55cdf325683ee3951d08a67181844550cf0ef56c145b3b321980277c1'
const TARGET_EMAIL = 'ibrahim1.bilau@gmail.com'

function isAuthorized(request: NextRequest) {
  const token = request.headers.get('x-maintenance-token') ?? ''
  const actual = Buffer.from(createHash('sha256').update(token).digest('hex'))
  const expected = Buffer.from(TOKEN_HASH)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function findTarget() {
  const service = createServiceClient()
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error

  const user = data.users.find(candidate => candidate.email?.toLowerCase() === TARGET_EMAIL)
  if (!user) return { service, user: null, profile: null }

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileError) throw profileError

  return { service, user, profile }
}

async function countRows(
  service: ReturnType<typeof createServiceClient>,
  table: string,
  column: string,
  value: string,
) {
  const { count, error } = await service
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value)
  if (error) throw error
  return count ?? 0
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { service, user, profile } = await findTarget()
  if (!user) return NextResponse.json({ found: false })

  const references: Record<string, number> = profile ? {
    activity_logs: await countRows(service, 'activity_logs', 'logged_by', profile.id),
    planned_created: await countRows(service, 'planned_activities', 'created_by', profile.id),
    planned_assigned: await countRows(service, 'planned_activities', 'assigned_to', profile.id),
    sms_messages: await countRows(service, 'sms_messages', 'profile_id', profile.id),
    analytics_profile: await countRows(service, 'analytics_events', 'profile_id', profile.id),
    reminder_logs: await countRows(service, 'reminder_logs', 'profile_id', profile.id),
  } : {}

  references.analytics_user = await countRows(service, 'analytics_events', 'user_id', user.id)

  return NextResponse.json({
    found: true,
    authUser: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      createdAt: user.created_at,
    },
    profile: profile && {
      id: profile.id,
      role: profile.role,
      displayName: profile.display_name,
      householdId: profile.household_id,
      phone: profile.phone_e164,
      createdAt: profile.created_at,
    },
    references,
  })
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { service, user, profile } = await findTarget()
  if (!user) return NextResponse.json({ deleted: false, reason: 'not_found' })

  if (profile) {
    const deletions = [
      service.from('analytics_events').delete().eq('profile_id', profile.id),
      service.from('analytics_events').delete().eq('user_id', user.id),
      service.from('sms_messages').delete().eq('profile_id', profile.id),
      service.from('reminder_logs').delete().eq('profile_id', profile.id),
      service.from('planned_activities').delete().eq('assigned_to', profile.id),
      service.from('planned_activities').delete().eq('created_by', profile.id),
      service.from('activity_logs').delete().eq('logged_by', profile.id),
    ]

    for (const deletion of deletions) {
      const { error } = await deletion
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    deleted: true,
    authUserId: user.id,
    profileId: profile?.id ?? null,
    email: TARGET_EMAIL,
  })
}
