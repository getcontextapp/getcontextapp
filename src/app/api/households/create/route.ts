import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase-server'
import { sendOnboardingWelcome } from '@/lib/onboarding-welcome'
import type { Profile } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Enter a household name.' }, { status: 400 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

  const { data: household, error: householdError } = await service
    .from('households')
    .insert({ name })
    .select('id, name, join_code')
    .single()

  if (householdError || !household) {
    return NextResponse.json({ error: householdError?.message ?? 'Failed to create household.' }, { status: 500 })
  }

  const { data: updatedProfile, error: profileError } = await service
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', profile.id)
    .select('*')
    .single()

  if (profileError || !updatedProfile) {
    await service.from('households').delete().eq('id', household.id)
    return NextResponse.json({ error: profileError?.message ?? 'Failed to link household.' }, { status: 500 })
  }

  await sendOnboardingWelcome(updatedProfile as Profile).catch(error => {
    console.error('[Onboarding] Welcome SMS failed:', error)
  })

  return NextResponse.json({ household })
}
