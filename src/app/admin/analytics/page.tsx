import { requireAnalyticsAdmin } from '@/lib/admin'
import { loadPilotAnalytics } from '@/lib/pilot-analytics'
import AnalyticsDashboard from './AnalyticsDashboard'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAnalyticsAdmin()
  const params = await searchParams
  const requestedDays = Number(Array.isArray(params.days) ? params.days[0] : params.days)
  const days = [7, 14, 30, 60, 90].includes(requestedDays) ? requestedDays : 30
  const householdId = String(Array.isArray(params.household) ? params.household[0] : params.household ?? '')
  const roleValue = String(Array.isArray(params.role) ? params.role[0] : params.role ?? '')
  const role = ['mci_user', 'care_partner'].includes(roleValue) ? roleValue : ''
  const data = await loadPilotAnalytics({ days, householdId, role })

  return <AnalyticsDashboard data={data} />
}
