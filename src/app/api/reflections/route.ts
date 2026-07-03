import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase-server'
import { getLocalDateKey } from '@/lib/dates'
import { reflectionToClient, saveReflectionInput } from '@/lib/reflections'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id || profile.role !== 'mci_user') {
    return NextResponse.json({ error: 'MCI profile required' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('reflections')
    .select('*')
    .eq('user_id', profile.user_id)
    .eq('reflection_date', getLocalDateKey(new Date(), profile.timezone))
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reflection: data ? reflectionToClient(data) : null })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id || profile.role !== 'mci_user') {
    return NextResponse.json({ error: 'MCI profile required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const rawInput = String(body.raw_input ?? '').trim()
  if (!rawInput) return NextResponse.json({ error: 'Reflection text is required' }, { status: 400 })

  try {
    const reflection = await saveReflectionInput(supabase, profile, rawInput, 'app')
    return NextResponse.json({ reflection })
  } catch (error) {
    console.error('[Reflection] Save failed:', error)
    return NextResponse.json({ error: 'Context could not save that reflection. Please try again.' }, { status: 500 })
  }
}

export async function DELETE() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.household_id || profile.role !== 'mci_user') {
    return NextResponse.json({ error: 'MCI profile required' }, { status: 403 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('reflections')
    .delete()
    .eq('user_id', profile.user_id)
    .eq('household_id', profile.household_id)
    .eq('reflection_date', getLocalDateKey(new Date(), profile.timezone))

  if (error) {
    console.error('[Reflection] Delete failed:', error)
    return NextResponse.json({ error: "Context could not clear today's reflection." }, { status: 500 })
  }

  return NextResponse.json({ reflection: null })
}
