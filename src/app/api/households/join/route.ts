import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { join_code } = await request.json().catch(() => ({}))
  const code = String(join_code ?? '').trim().toUpperCase()

  if (code.length !== 6) {
    return NextResponse.json({ error: 'Enter the 6-character household code.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: household } = await service
    .from('households')
    .select('id, join_code')
    .eq('join_code', code)
    .maybeSingle()

  if (!household) {
    return NextResponse.json({ error: 'No household found with that code.' }, { status: 404 })
  }

  const { data: profile, error } = await service
    .from('profiles')
    .update({ household_id: household.id })
    .eq('user_id', user.id)
    .select('id, household_id')
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: error?.message ?? 'Could not update household.' }, { status: 500 })
  }

  return NextResponse.json({ household_id: profile.household_id })
}
