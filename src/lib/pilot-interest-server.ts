import { createServiceClient } from '@/lib/supabase-server'
import type { PilotInterestRow } from '@/lib/pilot-interest'

export type PilotInterestData = {
  rows: PilotInterestRow[]
  error: string | null
  generatedAt: string
}

export async function loadPilotInterest(): Promise<PilotInterestData> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('pilot_interest')
    .select('id,name,email,phone,role,source,user_agent,created_at')
    .order('created_at', { ascending: false })

  return {
    rows: (data ?? []) as PilotInterestRow[],
    error: error?.message ?? null,
    generatedAt: new Date().toISOString(),
  }
}
