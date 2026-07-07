import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

const ROLES = new Set(['person_with_memory_changes', 'care_partner', 'clinician'])

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const name = cleanText(body.name, 120)
  const email = cleanText(body.email, 180).toLowerCase()
  const phone = cleanText(body.phone, 60)
  const role = cleanText(body.role, 80)

  if (!name || !isEmail(email) || !ROLES.has(role)) {
    return NextResponse.json(
      { error: 'Please add your name, a valid email, and choose the option that describes you.' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('pilot_interest').insert({
    name,
    email,
    phone: phone || null,
    role,
    source: cleanText(body.source, 80) || 'landing_home',
    user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
  })

  if (error) {
    console.error('[pilot-interest] insert failed:', error.message)
    return NextResponse.json({ error: 'Could not save your request right now.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
