import { createServiceClient } from '@/lib/supabase-server'
import { normalizePhone } from '@/lib/sms'

export async function linkSavedPhoneToAuth(
  userId: string,
  authPhone: string | null | undefined,
  profilePhone: string | null | undefined,
) {
  if (!profilePhone) return

  const normalizedProfilePhone = normalizePhone(profilePhone)
  if (authPhone && normalizePhone(authPhone) === normalizedProfilePhone) return

  const service = createServiceClient()
  const updatePhone = () => service.auth.admin.updateUserById(userId, {
    phone: normalizedProfilePhone,
    phone_confirm: true,
  })

  const { error } = await updatePhone()
  if (!error) return

  const { data: usersPage, error: usersError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (usersError) {
    console.error('[Auth] Could not inspect duplicate phone users:', usersError.message)
    return
  }

  const duplicate = usersPage.users.find(candidate =>
    candidate.id !== userId &&
    !candidate.email &&
    candidate.phone &&
    normalizePhone(candidate.phone) === normalizedProfilePhone
  )

  if (!duplicate) {
    console.error('[Auth] Could not link saved profile phone:', error.message)
    return
  }

  const { data: duplicateProfiles, error: profileError } = await service
    .from('profiles')
    .select('id')
    .eq('user_id', duplicate.id)
    .limit(1)

  if (profileError || (duplicateProfiles ?? []).length > 0) {
    console.error('[Auth] Refused to remove a phone user with an existing profile.')
    return
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(duplicate.id)
  if (deleteError) {
    console.error('[Auth] Could not remove empty duplicate phone user:', deleteError.message)
    return
  }

  const { error: retryError } = await updatePhone()
  if (retryError) {
    console.error('[Auth] Could not link saved profile phone after cleanup:', retryError.message)
  }
}
