import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

const DEFAULT_ADMIN_PROFILE_IDS = [
  '4fa751d5-a19b-49c3-92e1-546029ab6443',
]

export function getAnalyticsAdminEmails() {
  return new Set((process.env.ANALYTICS_ADMIN_EMAILS ?? '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean))
}

export function getAnalyticsAdminProfileIds() {
  const configured = (process.env.ANALYTICS_ADMIN_PROFILE_IDS ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)

  return new Set([...DEFAULT_ADMIN_PROFILE_IDS, ...configured])
}

async function getAdminAccess() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, allowed: false }

  const emailAllowed = Boolean(
    user.email && getAnalyticsAdminEmails().has(user.email.toLowerCase())
  )
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  const profileAllowed = Boolean(
    profile?.id && getAnalyticsAdminProfileIds().has(profile.id)
  )

  return { user, allowed: emailAllowed || profileAllowed }
}

export async function requireAnalyticsAdmin() {
  const { user, allowed } = await getAdminAccess()

  if (!user) redirect('/auth/login?next=/admin/analytics')
  if (!allowed) redirect('/')

  return user
}

export async function isAnalyticsAdmin() {
  return (await getAdminAccess()).allowed
}
