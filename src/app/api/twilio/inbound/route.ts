import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { parseSmsPlanReply } from '@/lib/anthropic'
import { getLocalDateKey } from '@/lib/dates'
import { buildPlanSavedReply, logSmsMessage, normalizePhone, twiml, APP_URL } from '@/lib/sms'
import { getSmsProfileMatch } from '@/lib/household-links'
import { trackEvent } from '@/lib/analytics'
import type { ActivityCategory, ExpectedPeriod } from '@/types'

function xmlResponse(message: string) {
  return new NextResponse(twiml(message), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

async function getPendingItems(supabase: ReturnType<typeof createServiceClient>, profile: any) {
  return supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', getLocalDateKey(new Date(), profile.timezone))
    .in('status', ['planned', 'not_now'])
    .order('created_at', { ascending: true })
}

function pendingItemLabel(item: any) {
  return item.note?.trim() || item.label || 'Plan item'
}

function buildPendingChoiceReply(pendingItems: any[], actionLabel = 'finished') {
  const lines = pendingItems
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${pendingItemLabel(item)}`)

  return [
    `I see a few things waiting:`,
    ...lines,
    ``,
    `Reply with the number you ${actionLabel}, or open Context: ${APP_URL}/mci-user`,
  ].join('\n')
}

async function updatePendingItem(
  supabase: ReturnType<typeof createServiceClient>,
  profile: any,
  item: any,
  confirmation: 'yes' | 'not_now' | 'skip',
) {
  if (confirmation === 'not_now') {
    await supabase.from('planned_activities').update({
      status: 'not_now',
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)
    return 'No problem. I left it in your Context plan for later.'
  }

  if (confirmation === 'skip') {
    await supabase.from('planned_activities').update({
      status: 'skipped',
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)
    return 'Okay. I marked that aside for today.'
  }

  const { data: activity } = await supabase
    .from('activity_logs')
    .insert({
      household_id: profile.household_id,
      logged_by: profile.id,
      category: item.category,
      label: item.label,
      note: item.note,
      occurred_at: new Date().toISOString(),
    })
    .select()
    .single()

  await supabase.from('planned_activities').update({
    status: 'confirmed',
    confirmed_activity_log_id: activity?.id ?? null,
    confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', item.id)

  await trackEvent(supabase, {
    eventName: 'sms_activity_confirmed',
    profile,
    userId: profile.user_id,
    properties: {
      planned_activity_id: item.id,
      activity_id: activity?.id ?? null,
      category: item.category,
    },
  })

  return `Thank you. I marked "${pendingItemLabel(item)}" as done in Context.`
}

async function handleNumberedSelection(supabase: ReturnType<typeof createServiceClient>, profile: any, body: string) {
  const match = body.trim().match(/^\d+$/)
  if (!match) return null

  const selectedIndex = Number(match[0]) - 1
  const { data: pendingItems } = await getPendingItems(supabase, profile)

  if (!pendingItems || pendingItems.length === 0) {
    return `I do not see anything waiting in today's plan. You can open Context here: ${APP_URL}/mci-user`
  }

  const item = pendingItems[selectedIndex]
  if (!item) {
    return buildPendingChoiceReply(pendingItems)
  }

  return updatePendingItem(supabase, profile, item, 'yes')
}

async function handleConfirmation(supabase: ReturnType<typeof createServiceClient>, profile: any, confirmation: 'yes' | 'not_now' | 'skip') {
  const { data: pendingItems } = await getPendingItems(supabase, profile)

  if (!pendingItems || pendingItems.length === 0) {
    return `I do not see anything waiting in today's plan. You can open Context here: ${APP_URL}/mci-user`
  }

  if (pendingItems.length > 1) {
    const actionLabel = confirmation === 'not_now' ? 'want to leave for later' : confirmation === 'skip' ? 'want to set aside' : 'finished'
    return buildPendingChoiceReply(pendingItems, actionLabel)
  }

  return updatePendingItem(supabase, profile, pendingItems[0], confirmation)
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const from = normalizePhone(String(formData.get('From') ?? ''))
  const body = String(formData.get('Body') ?? '').trim()
  const messageSid = String(formData.get('MessageSid') ?? '')
  const supabase = createServiceClient()

  if (!from || !body) return xmlResponse('Context received an empty message.')

  const match = await getSmsProfileMatch(supabase, from)
  const profile = match.profile

  if (!profile?.household_id) {
    console.error('[SMS] Unmatched inbound reply:', match.debug)
    await logSmsMessage(supabase, {
      direction: 'inbound',
      purpose: 'inbound_other',
      phoneE164: from,
      body,
      twilioSid: messageSid,
      status: 'unmatched',
      metadata: { match_debug: match.debug },
    })
    return xmlResponse([
      `Context could not match this phone number to a profile. Open Context here: ${APP_URL}`,
      ``,
      `Debug: incoming ${match.debug.inputLast10 ? `...${match.debug.inputLast10.slice(-4)}` : 'blank'}, checked ${match.debug.profileCount} profiles and ${match.debug.smsCount} SMS records.`,
      `Profile phones: ${match.debug.profilePhoneEndings.join(', ') || 'none'}`,
      `SMS phones: ${match.debug.smsPhoneEndings.join(', ') || 'none'}`,
      match.debug.error ? `Error: ${match.debug.error}` : null,
    ].filter(Boolean).join('\n'))
  }

  await logSmsMessage(supabase, {
    householdId: profile.household_id,
    profileId: profile.id,
    direction: 'inbound',
    purpose: 'inbound_other',
    phoneE164: from,
    body,
    twilioSid: messageSid,
    status: 'received',
  })

  const numberedSelectionReply = await handleNumberedSelection(supabase, profile, body)
  if (numberedSelectionReply) {
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: numberedSelectionReply,
      status: 'twiml_reply',
      metadata: { selected_by_number: body },
    })
    return xmlResponse(numberedSelectionReply)
  }

  const parsed = await parseSmsPlanReply(body, profile.display_name, profile.timezone)

  if (parsed.intent === 'confirmation' && parsed.confirmation) {
    const reply = await handleConfirmation(supabase, profile, parsed.confirmation)
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: reply,
      status: 'twiml_reply',
      metadata: { parsed },
    })
    return xmlResponse(reply)
  }

  if (parsed.intent !== 'plan' || parsed.items.length === 0) {
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_other',
      phoneE164: from,
      body: parsed.reply,
      status: 'twiml_reply',
      metadata: { parsed },
    })
    return xmlResponse(parsed.reply)
  }

  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const rows = parsed.items.map(item => ({
    household_id: profile.household_id,
    created_by: profile.id,
    assigned_to: profile.id,
    category: item.category as ActivityCategory,
    label: item.category === 'custom' ? 'Other' : item.category[0].toUpperCase() + item.category.slice(1),
    note: item.note,
    expected_period: item.expected_period as ExpectedPeriod,
    planned_for: todayKey,
    source: 'sms_ai',
  }))

  const { data: plannedItems, error } = await supabase
    .from('planned_activities')
    .insert(rows)
    .select()

  if (error) {
    console.error('[SMS] Planned insert failed:', error.message)
    return xmlResponse(`I had trouble saving that. Please open Context here: ${APP_URL}/mci-user`)
  }

  await trackEvent(supabase, {
    eventName: 'sms_plan_parsed',
    profile,
    userId: profile.user_id,
    properties: {
      item_count: plannedItems?.length ?? 0,
      raw_length: body.length,
      parsed,
    },
  })

  const reply = buildPlanSavedReply(plannedItems?.length ?? parsed.items.length)
  await logSmsMessage(supabase, {
    householdId: profile.household_id,
    profileId: profile.id,
    direction: 'outbound',
    purpose: 'inbound_plan_reply',
    phoneE164: from,
    body: reply,
    status: 'twiml_reply',
    metadata: { parsed, planned_item_ids: plannedItems?.map(item => item.id) ?? [] },
  })

  return xmlResponse(reply)
}
