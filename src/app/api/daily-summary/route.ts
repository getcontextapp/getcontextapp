import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSMS, buildDailySummaryMessage } from '@/lib/twilio'
import { ACTIVITY_TILES } from '@/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://getcontextapp.com'
const CRON_SECRET = process.env.CRON_SECRET

// POST: manual trigger (from care partner UI)
export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  const { data: careProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!careProfile || careProfile.role !== 'care_partner' || !careProfile.phone_e164) {
    return NextResponse.json({ error: 'No phone number on file' }, { status: 400 })
  }

  const result = await sendDailySummary(careProfile.household_id, careProfile)
  return NextResponse.json(result)
}

// GET: Vercel cron — runs every hour, checks if any care partner is due
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const currentHour = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

  const { data: careProfiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'care_partner')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)

  if (!careProfiles) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const profile of careProfiles) {
    if (profile.daily_summary_time !== currentHour) continue

    // Don't send twice in same hour
    const hourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { data: already } = await supabase
      .from('reminder_logs')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('type', 'daily_summary')
      .gte('sent_at', hourAgo)
      .limit(1)
      .single()

    if (already) continue

    await sendDailySummary(profile.household_id, profile)
    sent++
  }

  return NextResponse.json({ sent })
}

async function sendDailySummary(householdId: string, careProfile: any) {
  const supabase = createServiceClient()

  // Get MCI user profile
  const { data: mciProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('household_id', householdId)
    .eq('role', 'mci_user')
    .single()

  // Get today's activities
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const { data: activities } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('household_id', householdId)
    .gte('occurred_at', todayStart.toISOString())
    .order('occurred_at', { ascending: true })
    .limit(20)

  const activityList = (activities ?? []).map(a => {
    const tile = ACTIVITY_TILES.find(t => t.category === a.category)
    return { icon: tile?.icon ?? '📌', label: a.label, occurred_at: a.occurred_at }
  })

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const smsBody = buildDailySummaryMessage(
    careProfile.display_name,
    mciProfile?.display_name ?? 'your household member',
    dateStr,
    activityList,
    APP_URL,
  )

  const { sid, status } = await sendSMS(careProfile.phone_e164, smsBody)

  await supabase.from('reminder_logs').insert({
    household_id: householdId,
    profile_id: careProfile.id,
    type: 'daily_summary',
    twilio_sid: sid,
    status,
  })

  return { sent: true, status }
}
