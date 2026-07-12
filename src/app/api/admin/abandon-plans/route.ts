import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getLocalDateKey } from '@/lib/dates'
import { getMciProfilesForSms } from '@/lib/household-links'
import { ensureRepeatOccurrencesForDate } from '@/lib/task-scheduling-server'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  if (CRON_SECRET && request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const profiles = await getMciProfilesForSms(supabase)
  for (const profile of profiles) {
    await ensureRepeatOccurrencesForDate(
      supabase,
      profile.household_id,
      getLocalDateKey(new Date(), profile.timezone),
    )
  }

  const { data, error } = await supabase.rpc('abandon_past_planned_activities')

  if (error) {
    console.error('[Admin] Abandon plans failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, abandoned: data ?? 0 })
}
