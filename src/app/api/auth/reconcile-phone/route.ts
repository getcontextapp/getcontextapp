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
  const phoneDigits = phone.replace(/\D/g, '')
  const phoneCandidates = Array.from(new Set([
    phone,
    phoneDigits,
    phoneDigits.length === 11 && phoneDigits.startsWith('1') ? phoneDigits.slice(1) : phoneDigits,
  ]))

  const { data: profiles, error: profileError } = await service
    .from('profiles')
    .select('user_id')
    .in('phone_e164', phoneCandidates)
    .limit(10)

  if (profileError) {
    return NextResponse.json({ error: 'We could not look up this phone number.' }, { status: 500 })
  }

  const profileUserIds = Array.from(new Set((profiles ?? []).map(profile => profile.user_id)))
  if (profileUserIds.length === 0) {
    return NextResponse.json(
      { error: 'This phone number is not saved on an existing Context profile. Sign in by email and check the profile phone number.' },
      { status: 404 },
    )
  }

  if (profileUserIds.length > 1) {
    return NextResponse.json(
      { error: 'This phone number appears on more than one Context profile. Please sign in by email while we correct it.' },
      { status: 409 },
    )
  }

  const profileUserId = profileUserIds[0]
  if (profileUserId === user.id) {
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

  const { data: duplicateProfiles, error: duplicateProfileError } = await service
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (duplicateProfileError) {
    return NextResponse.json({ error: 'We could not verify this phone account.' }, { status: 500 })
  }

  if ((duplicateProfiles ?? []).length > 0) {
    return NextResponse.json(
      { error: 'This phone account already has a Context profile and cannot be merged automatically.' },
      { status: 409 },
    )
  }

  const { data: targetUser, error: targetError } = await service.auth.admin.getUserById(profileUserId)
  if (targetError || !targetUser.user) {
    return NextResponse.json({ error: 'The existing Context account could not be found by phone. Please sign in by email once to repair the link.' }, { status: 404 })
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  const { error: linkError } = await service.auth.admin.updateUserById(profileUserId, {
    phone,
    phone_confirm: true,
  })
  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  return NextResponse.json({ reconciled: true })
}
