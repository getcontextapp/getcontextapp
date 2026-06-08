import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase-server'
import { normalizePhone } from '@/lib/sms'

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.phone) {
    return NextResponse.json({ error: 'A verified phone session is required.' }, { status: 401 })
  }

  const service = createServiceClient()
  const phone = normalizePhone(user.phone)
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('user_id')
    .eq('phone_e164', phone)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  if (!profile || profile.user_id === user.id) {
    return NextResponse.json({ reconciled: false })
  }

  // Never merge an established account automatically. This repair is only for
  // a phone-only auth record that has no Context profile of its own.
  if (user.email) {
    return NextResponse.json(
      { error: 'This phone number is connected to another established account.' },
      { status: 409 },
    )
  }

  const { data: duplicateProfile } = await service
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (duplicateProfile) {
    return NextResponse.json(
      { error: 'This phone account already has a Context profile and cannot be merged automatically.' },
      { status: 409 },
    )
  }

  const { data: targetUser, error: targetError } = await service.auth.admin.getUserById(profile.user_id)
  if (targetError || !targetUser.user) {
    return NextResponse.json({ error: targetError?.message || 'Existing account not found.' }, { status: 404 })
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  const { error: linkError } = await service.auth.admin.updateUserById(profile.user_id, {
    phone,
    phone_confirm: true,
  })
  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  return NextResponse.json({ reconciled: true })
}
