import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'

export default async function RootPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get profile to determine role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, household_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    redirect('/onboarding')
  }

  if (!profile.household_id) {
    redirect('/onboarding/household')
  }

  if (profile.role === 'care_partner') {
    redirect('/care-partner')
  }

  redirect('/mci-user')
}
