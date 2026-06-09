import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const sid = String(formData.get('MessageSid') ?? '')
  const status = String(formData.get('MessageStatus') ?? '')
  const errorCode = String(formData.get('ErrorCode') ?? '')

  if (!sid || !status) return new NextResponse(null, { status: 400 })

  const service = createServiceClient()
  const { data: message } = await service
    .from('sms_messages')
    .select('id, metadata')
    .eq('twilio_sid', sid)
    .maybeSingle()

  if (message) {
    await service
      .from('sms_messages')
      .update({
        status,
        metadata: {
          ...(message.metadata as Record<string, unknown> ?? {}),
          delivery_updated_at: new Date().toISOString(),
          error_code: errorCode || null,
        },
      })
      .eq('id', message.id)
  }

  await service
    .from('reminder_logs')
    .update({ status })
    .eq('twilio_sid', sid)

  return new NextResponse(null, { status: 204 })
}
