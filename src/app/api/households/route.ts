import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id) return NextResponse.json(null)

  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('id', profile.household_id)
    .single()

  return NextResponse.json(household)
}
