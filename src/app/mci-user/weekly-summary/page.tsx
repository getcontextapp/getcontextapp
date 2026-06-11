import { redirect } from 'next/navigation'
import WeeklySummaryView from '@/components/weekly/WeeklySummaryView'
import { createServerClient } from '@/lib/supabase-server'
import { loadWeeklySummary } from '@/lib/weekly-summary-server'
import type { Profile } from '@/types'

export default async function MciWeeklySummaryPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
  const profile = data as Profile | null
  if (!profile || profile.role !== 'mci_user') redirect('/')

  const summary = await loadWeeklySummary(supabase, profile)
  return <WeeklySummaryView summary={summary} role="mci_user" />
}
