import { redirect } from 'next/navigation'
import WeeklySummaryView from '@/components/weekly/WeeklySummaryView'
import { getLinkedMciProfile } from '@/lib/household-links'
import { createServerClient } from '@/lib/supabase-server'
import { loadWeeklySummary } from '@/lib/weekly-summary-server'
import type { Profile } from '@/types'

export default async function CarePartnerWeeklySummaryPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
  const profile = data as Profile | null
  if (!profile || profile.role !== 'care_partner') redirect('/')

  const mciProfile = await getLinkedMciProfile(supabase, profile.household_id, profile.id)
  if (!mciProfile) redirect('/care-partner')

  const summary = await loadWeeklySummary(supabase, mciProfile)
  return <WeeklySummaryView summary={summary} role="care_partner" />
}
