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
  const { error } = await service.auth.admin.updateUserById(userId, {
    phone: normalizedProfilePhone,
    phone_confirm: true,
  })

  if (error) {
    console.error('[Auth] Could not link saved profile phone:', error.message)
  }
}
