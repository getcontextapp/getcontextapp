import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { parsePilotInterestSubmission } from '@/lib/pilot-interest'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  if (typeof body.website === 'string' && body.website.trim()) {
    return NextResponse.json({ ok: true })
  }

  const parsed = parsePilotInterestSubmission(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Please add your name, a valid email, and choose the option that describes you.' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()
  const { data: existing, error: lookupError } = await supabase
    .from('pilot_interest')
    .select('id')
    .eq('email', parsed.submission.email)
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    console.error('[pilot-interest] lookup failed:', lookupError.message)
    return NextResponse.json({ error: 'Could not save your request right now.' }, { status: 500 })
  }
  if (existing) return NextResponse.json({ ok: true, already_registered: true })

  const { error } = await supabase.from('pilot_interest').insert({
    ...parsed.submission,
    user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
  })

  if (error) {
    console.error('[pilot-interest] insert failed:', error.message)
    return NextResponse.json({ error: 'Could not save your request right now.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
