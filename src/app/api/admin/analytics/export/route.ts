import { NextRequest, NextResponse } from 'next/server'
import { isAnalyticsAdmin } from '@/lib/admin'
import { loadPilotAnalytics } from '@/lib/pilot-analytics'

function csvCell(value: unknown) {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return 'No data\n'
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))))
  return [
    headers.map(csvCell).join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n')
}

export async function GET(request: NextRequest) {
  if (!(await isAnalyticsAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const daysValue = Number(request.nextUrl.searchParams.get('days'))
  const days = [7, 14, 30, 60, 90].includes(daysValue) ? daysValue : 30
  const householdId = request.nextUrl.searchParams.get('household') ?? ''
  const roleValue = request.nextUrl.searchParams.get('role') ?? ''
  const role = ['mci_user', 'care_partner'].includes(roleValue) ? roleValue : ''
  const dataset = request.nextUrl.searchParams.get('dataset') ?? 'events'
  const data = await loadPilotAnalytics({ days, householdId, role })
  const available = data.exports as Record<string, Array<Record<string, unknown>>>
  const rows = available[dataset]
  if (!rows) return NextResponse.json({ error: 'Unknown dataset' }, { status: 400 })

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="context-${dataset}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
