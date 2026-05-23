import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generateReentryCard } from '@/lib/anthropic'
import { sendSMS, buildReentryMessage } from '@/lib/twilio'
import { ACTIVITY_TILES } from '@/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://getcontextapp.com'
const CRON_SECRET = process.env.CRON_SECRET

// Called by Vercel Cron every 15 minutes
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Find all MCI users with a phone number and a household
  const { data: mciProfiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'mci_user')
    .not('phone_e164', 'is', null)
    .not('household_id', 'is', null)

  if (!mciProfiles || mciProfiles.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let sent = 0

  for (const profile of mciProfiles) {
    const gapMs = (profile.reminder_gap_minutes ?? 90) * 60 * 1000
    const checkFrom = new Date(Date.now() - gapMs).toISOString()

    // Check if any activity has been logged since gap threshold
    const { data: recentActivity } = await supabase
      .from('activity_logs')
      .select('id, occurred_at')
      .eq('household_id', profile.household_id)
      .gte('occurred_at', checkFrom)
      .limit(1)
      .single()

    if (recentActivity) continue // Active recently — no reminder needed

    // Check if we sent a reminder in the last gap period (avoid duplicates)
    const { data: recentReminder } = await supabase
      .from('reminder_logs')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('type', 'reentry')
      .gte('sent_at', checkFrom)
      .limit(1)
      .single()

    if (recentReminder) continue // Already sent one in this window

    // Check that they logged at least one activity ever (not a brand-new user)
    const { data: hasAnyActivity } = await supabase
      .from('activity_logs')
      .select('id, label, category, occurred_at')
      .eq('household_id', profile.household_id)
      .order('occurred_at', { ascending: false })
      .limit(6)

    if (!hasAnyActivity || hasAnyActivity.length === 0) continue

    // Generate re-entry card
    let generated: { title: string; body: string }
    try {
      generated = await generateReentryCard({
        displayName: profile.display_name,
        recentActivities: hasAnyActivity,
        triggerActivity: hasAnyActivity[0],
        gapMinutes: profile.reminder_gap_minutes ?? 90,
      })
    } catch {
      generated = {
        title: 'Welcome back',
        body: `Hi ${profile.display_name}, it looks like it's been a little while. Tap the app to see your day and log your next activity.`,
      }
    }

    // Save re-entry card to DB
    await supabase.from('context_cards').insert({
      household_id: profile.household_id,
      type: 'reentry',
      title: generated.title,
      body: generated.body,
      generated_by: 'ai',
      is_active: true,
    })

    // Build SMS
    const recentLabels = hasAnyActivity.map(a => {
      const tile = ACTIVITY_TILES.find(t => t.category === a.category)
      return `${tile?.icon ?? ''} ${a.label}`.trim()
    })

    const smsBody = buildReentryMessage(
      profile.display_name,
      recentLabels,
      generated.title,
      generated.body,
      APP_URL,
    )

    // Send SMS
    const { sid, status } = await sendSMS(profile.phone_e164!, smsBody)

    // Log the reminder
    await supabase.from('reminder_logs').insert({
      household_id: profile.household_id,
      profile_id: profile.id,
      type: 'reentry',
      twilio_sid: sid,
      status,
    })

    sent++
  }

  return NextResponse.json({ processed: mciProfiles.length, sent })
}
