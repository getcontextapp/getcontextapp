import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { trackEvent } from '@/lib/analytics'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const eventName = typeof body.event_name === 'string' ? body.event_name : null
  const properties = body.properties && typeof body.properties === 'object' ? body.properties : {}

  if (!eventName) {
    return NextResponse.json({ error: 'Missing event_name' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, user_id, household_id, role')
    .eq('user_id', user.id)
    .single()

  await trackEvent(supabase, {
    eventName,
    properties,
    profile,
    userId: user.id,
  })

  return NextResponse.json({ ok: true })
}
