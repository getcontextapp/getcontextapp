import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

const DEFAULT_ADMIN_EMAILS = [
  'getcontextapp@gmail.com',
  'ibrahim1.bilau@gmail.com',
]

export function getAnalyticsAdminEmails() {
  const configured = (process.env.ANALYTICS_ADMIN_EMAILS ?? '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)

  return new Set([...DEFAULT_ADMIN_EMAILS, ...configured])
}

export async function requireAnalyticsAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')
  if (!user.email || !getAnalyticsAdminEmails().has(user.email.toLowerCase())) {
    redirect('/')
  }

  return user
}

export async function isAnalyticsAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return Boolean(user?.email && getAnalyticsAdminEmails().has(user.email.toLowerCase()))
}
