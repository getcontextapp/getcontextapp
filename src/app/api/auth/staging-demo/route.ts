import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DEMO_EMAILS = {
  solo: 'solo.demo@getcontextapp.com',
  shared: 'shared.demo@getcontextapp.com',
  care_partner: 'cp.demo@getcontextapp.com',
} as const

export async function POST(request: NextRequest) {
  if (process.env.CONTEXT_ENV !== 'staging') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const account = typeof body.account === 'string' ? body.account : ''
  if (!(account in DEMO_EMAILS)) {
    return NextResponse.json({ error: 'Choose a valid demo account.' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const password = process.env.STAGING_DEMO_PASSWORD
  if (!url || !anonKey || !password) {
    return NextResponse.json({ error: 'Staging demo login is not configured.' }, { status: 503 })
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAILS[account as keyof typeof DEMO_EMAILS],
    password,
  })
  if (error || !data.session) {
    return NextResponse.json({ error: 'The staging demo account could not be opened.' }, { status: 401 })
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  }, {
    headers: { 'cache-control': 'no-store' },
  })
}
