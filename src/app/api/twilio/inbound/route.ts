import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { parsePendingSmsReply, parseSmsPlanReply } from '@/lib/anthropic'
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

const UNKNOWN_NUMBER_REPLY = [
  'This number is not signed up with Context yet.',
  'Context helps older adults and care partners stay oriented with gentle reminders, simple check-ins, and daily summaries.',
  `Learn more or sign in here: ${APP_URL}`,
].join('\n')

const CARE_PARTNER_LIMIT_REPLY = [
  'This number is registered as a Context care partner.',
  'Care partner SMS is limited to updates and summaries right now. Activity confirmations must come from the MCI member.',
  `Open your care partner view here: ${APP_URL}/care-partner`,
].join('\n')

async function getPendingItems(supabase: ReturnType<typeof createServiceClient>, profile: any) {
  return supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', getLocalDateKey(new Date(), profile.timezone))
    .in('status', ['planned', 'not_now'])
    .order('created_at', { ascending: true })
}

async function getTodaysPlannedItems(supabase: ReturnType<typeof createServiceClient>, profile: any) {
  return supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', getLocalDateKey(new Date(), profile.timezone))
    .order('created_at', { ascending: true })
    .limit(8)
}

function pendingItemLabel(item: any) {
  return item.note?.trim() || item.label || 'Plan item'
}

function categoryLabel(category: ActivityCategory) {
  return category === 'custom' ? 'Other' : category[0].toUpperCase() + category.slice(1)
}

function formatItemList(labels: string[]) {
  if (labels.length === 1) return `"${labels[0]}"`
  if (labels.length === 2) return `"${labels[0]}" and "${labels[1]}"`
  return `${labels.slice(0, -1).map(label => `"${label}"`).join(', ')}, and "${labels[labels.length - 1]}"`
}

function parseNumberedSelections(body: string) {
  const normalized = body
    .trim()
    .toLowerCase()
    .replace(/\b(and|plus)\b/g, ',')
    .replace(/[&+/]/g, ',')
  const hasConfirmationCue = /\b(done|did|finished|finish|completed|complete|yes|yep|all done|delete|remove)\b/.test(normalized)

  if (/^(all|both|everything|the rest|all done)$/.test(normalized)) return 'all' as const

  const selections = normalized
    .match(/\d+/g)
    ?.map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0) ?? []

  if (selections.length === 0) return null
  if (!/^\d+(?:[\s,.-]+\d+)*$/.test(normalized) && !hasConfirmationCue) return null

  return Array.from(new Set(selections))
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

function buildCompletedChoiceReply(completedItems: any[]) {
  const lines = completedItems
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${pendingItemLabel(item)}`)

  return [
    `I see these completed today:`,
    ...lines,
    ``,
    `Reply with the number or numbers to move back to waiting.`,
  ].join('\n')
}

function statusLabel(status: string) {
  if (status === 'confirmed') return 'done'
  if (status === 'not_now') return 'later'
  if (status === 'skipped') return 'skipped'
  return 'waiting'
}

function buildDeleteChoiceReply(items: any[]) {
  const lines = items
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${pendingItemLabel(item)} (${statusLabel(item.status)})`)

  return [
    `Which task should I delete?`,
    ...lines,
    ``,
    `Reply with the number or numbers to delete, or say cancel.`,
  ].join('\n')
}

function buildDeleteConfirmReply(items: any[]) {
  return [
    `Are you sure you want to delete ${formatItemList(items.map(pendingItemLabel))}?`,
    `Reply YES to delete, or NO to keep it.`,
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

function isUndoRequest(body: string) {
  return /\b(undo|mistake|not done|did not do|didn't do|accident|accidentally)\b/i.test(body)
}

function isDeleteRequest(body: string) {
  return /\b(delete|remove|erase|trash|drop)\b/i.test(body)
}

function isCancelReply(body: string) {
  return /\b(no|nope|cancel|stop|keep|never mind|nevermind|do not|don't)\b/i.test(body.trim())
}

function isConfirmDeleteReply(body: string) {
  return /\b(yes|y|yep|yeah|confirm|sure|delete|remove|go ahead|do it)\b/i.test(body.trim())
}

async function reopenMostRecentConfirmedItem(supabase: ReturnType<typeof createServiceClient>, profile: any) {
  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const { data: completedItems } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', todayKey)
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false, nullsFirst: false })
    .limit(6)

  if (!completedItems || completedItems.length === 0) {
    return `I do not see a completed planned item to undo today. You can open Context here: ${APP_URL}/mci-user`
  }

  return buildCompletedChoiceReply(completedItems)
}

async function reopenConfirmedItems(
  supabase: ReturnType<typeof createServiceClient>,
  profile: any,
  items: any[],
) {
  const labels: string[] = []
  for (const item of items) {
    labels.push(pendingItemLabel(item))
    const confirmedActivityLogId = item.confirmed_activity_log_id
    await supabase
      .from('planned_activities')
      .update({
        status: 'planned',
        confirmed_activity_log_id: null,
        confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    if (confirmedActivityLogId) {
      await supabase
        .from('activity_logs')
        .delete()
        .eq('id', confirmedActivityLogId)
        .eq('household_id', profile.household_id)
    }

    await trackEvent(supabase, {
      eventName: 'sms_activity_reopened',
      profile,
      userId: profile.user_id,
      properties: {
        planned_activity_id: item.id,
        deleted_activity_id: confirmedActivityLogId,
      },
    })
  }

  return `No problem. I moved ${formatItemList(labels)} back to waiting in your Context plan.`
}

async function handleUndoSelection(supabase: ReturnType<typeof createServiceClient>, profile: any, body: string) {
  const selections = parseNumberedSelections(body)
  if (!selections) return null

  const todayKey = getLocalDateKey(new Date(), profile.timezone)
  const { data: completedItems } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .eq('planned_for', todayKey)
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false, nullsFirst: false })
    .limit(6)

  if (!completedItems || completedItems.length === 0) return null

  const recentUndoPrompt = await hasRecentSmsPurpose(supabase, profile, 'inbound_confirmation', {
    undo_prompt: true,
  })
  if (!recentUndoPrompt) return null

  const selectedIndexes = selections === 'all'
    ? completedItems.map((_, index) => index)
    : selections.map(selection => selection - 1)

  const selectedItems = selectedIndexes
    .map(index => completedItems[index])
    .filter(Boolean)

  if (selectedItems.length === 0) return buildCompletedChoiceReply(completedItems)

  return reopenConfirmedItems(supabase, profile, selectedItems)
}

async function deletePlannedItems(
  supabase: ReturnType<typeof createServiceClient>,
  profile: any,
  items: any[],
) {
  const labels = items.map(pendingItemLabel)
  const plannedIds = items.map(item => item.id).filter(Boolean)
  const linkedActivityIds = items
    .map(item => item.confirmed_activity_log_id)
    .filter(Boolean)

  if (plannedIds.length > 0) {
    await supabase
      .from('planned_activities')
      .delete()
      .eq('household_id', profile.household_id)
      .in('id', plannedIds)
  }

  if (linkedActivityIds.length > 0) {
    await supabase
      .from('activity_logs')
      .delete()
      .eq('household_id', profile.household_id)
      .in('id', linkedActivityIds)
  }

  for (const item of items) {
    await trackEvent(supabase, {
      eventName: 'sms_planned_activity_deleted',
      profile,
      userId: profile.user_id,
      properties: {
        planned_activity_id: item.id,
        deleted_activity_id: item.confirmed_activity_log_id ?? null,
        category: item.category,
        previous_status: item.status,
      },
    })
  }

  return `Okay. I deleted ${formatItemList(labels)} from today's Context plan.`
}

async function handleDeleteRequest(supabase: ReturnType<typeof createServiceClient>, profile: any) {
  const { data: items } = await getTodaysPlannedItems(supabase, profile)
  if (!items || items.length === 0) {
    return `I do not see any tasks in today's Context plan. You can open Context here: ${APP_URL}/mci-user`
  }

  return buildDeleteChoiceReply(items)
}

async function handleDeleteSelection(supabase: ReturnType<typeof createServiceClient>, profile: any, body: string) {
  const selections = parseNumberedSelections(body)
  if (!selections) return null

  const recentDeletePrompt = await hasRecentSmsPurpose(supabase, profile, 'inbound_confirmation', {
    delete_prompt: true,
  })
  if (!recentDeletePrompt) return null

  const { data: items } = await getTodaysPlannedItems(supabase, profile)
  if (!items || items.length === 0) return null

  const selectedIndexes = selections === 'all'
    ? items.map((_, index) => index)
    : selections.map(selection => selection - 1)

  const selectedItems = selectedIndexes
    .map(index => items[index])
    .filter(Boolean)

  if (selectedItems.length === 0) return buildDeleteChoiceReply(items)

  return {
    reply: buildDeleteConfirmReply(selectedItems),
    selectedItems,
  }
}

async function handleDeleteConfirmation(supabase: ReturnType<typeof createServiceClient>, profile: any, body: string) {
  const recentMetadata = await getRecentSmsMetadata(supabase, profile, 'inbound_confirmation', {
    delete_confirm_prompt: true,
  })
  if (!recentMetadata) return null

  if (isCancelReply(body)) return 'Okay. I did not delete anything.'
  if (!isConfirmDeleteReply(body)) {
    return 'Please reply YES to delete, or NO to keep it.'
  }

  const itemIds = Array.isArray(recentMetadata.delete_item_ids)
    ? recentMetadata.delete_item_ids.filter((id): id is string => typeof id === 'string')
    : []
  if (itemIds.length === 0) return 'I could not find those tasks anymore. Nothing was deleted.'

  const { data: items } = await supabase
    .from('planned_activities')
    .select('*')
    .eq('household_id', profile.household_id)
    .in('id', itemIds)

  if (!items || items.length === 0) return 'I could not find those tasks anymore. Nothing was deleted.'

  const orderedItems = itemIds
    .map(id => items.find(item => item.id === id))
    .filter(Boolean)

  return deletePlannedItems(supabase, profile, orderedItems)
}

async function hasRecentSmsPurpose(
  supabase: ReturnType<typeof createServiceClient>,
  profile: any,
  purpose: string,
  metadataMatch: Record<string, unknown>,
) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('sms_messages')
    .select('metadata')
    .eq('profile_id', profile.id)
    .eq('direction', 'outbound')
    .eq('purpose', purpose)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5)

  return Boolean((data ?? []).some(message => {
    const metadata = message.metadata as Record<string, unknown>
    return Object.entries(metadataMatch).every(([key, value]) => metadata?.[key] === value)
  }))
}

async function getRecentSmsMetadata(
  supabase: ReturnType<typeof createServiceClient>,
  profile: any,
  purpose: string,
  metadataMatch: Record<string, unknown>,
) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('sms_messages')
    .select('metadata')
    .eq('profile_id', profile.id)
    .eq('direction', 'outbound')
    .eq('purpose', purpose)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5)

  return (data ?? [])
    .map(message => message.metadata as Record<string, unknown>)
    .find(metadata => Object.entries(metadataMatch).every(([key, value]) => metadata?.[key] === value)) ?? null
}

async function handleNumberedSelection(supabase: ReturnType<typeof createServiceClient>, profile: any, body: string) {
  const selections = parseNumberedSelections(body)
  if (!selections) return null

  const { data: pendingItems } = await getPendingItems(supabase, profile)

  if (!pendingItems || pendingItems.length === 0) {
    return `I do not see anything waiting in today's plan. You can open Context here: ${APP_URL}/mci-user`
  }

  const selectedIndexes = selections === 'all'
    ? pendingItems.map((_, index) => index)
    : selections.map(selection => selection - 1)

  const selectedItems = selectedIndexes
    .map(index => pendingItems[index])
    .filter(Boolean)

  if (selectedItems.length === 0) {
    return buildPendingChoiceReply(pendingItems)
  }

  const labels: string[] = []
  for (const item of selectedItems) {
    labels.push(pendingItemLabel(item))
    await updatePendingItem(supabase, profile, item, 'yes')
  }

  return `Thank you. I marked ${formatItemList(labels)} as done in Context.`
}

async function updateSelectedPendingItems(
  supabase: ReturnType<typeof createServiceClient>,
  profile: any,
  items: any[],
  confirmation: 'yes' | 'not_now' | 'skip',
) {
  const labels: string[] = []
  for (const item of items) {
    labels.push(pendingItemLabel(item))
    await updatePendingItem(supabase, profile, item, confirmation)
  }

  if (confirmation === 'not_now') {
    return `No problem. I left ${formatItemList(labels)} in your Context plan for later.`
  }

  if (confirmation === 'skip') {
    return `Okay. I set ${formatItemList(labels)} aside for today.`
  }

  return `Thank you. I marked ${formatItemList(labels)} as done in Context.`
}

async function handleNaturalPendingReply(supabase: ReturnType<typeof createServiceClient>, profile: any, body: string) {
  const { data: pendingItems } = await getPendingItems(supabase, profile)
  if (!pendingItems || pendingItems.length === 0) return null

  const parsed = await parsePendingSmsReply(
    body,
    pendingItems.map(item => ({
      label: item.label,
      category: item.category,
      note: item.note,
      expected_period: item.expected_period,
    })),
    profile.display_name,
    profile.timezone,
  )

  if (parsed.intent !== 'pending_action' || !parsed.action) return null

  const selectedItems = parsed.selected_numbers === 'all'
    ? pendingItems
    : parsed.selected_numbers
      .map(selection => pendingItems[selection - 1])
      .filter(Boolean)

  if (selectedItems.length === 0) {
    return {
      reply: buildPendingChoiceReply(pendingItems),
      parsed,
    }
  }

  const reply = await updateSelectedPendingItems(supabase, profile, selectedItems, parsed.action)
  return { reply, parsed }
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
    return xmlResponse(UNKNOWN_NUMBER_REPLY)
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

  if (profile.role !== 'mci_user') {
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_other',
      phoneE164: from,
      body: CARE_PARTNER_LIMIT_REPLY,
      status: 'twiml_reply',
      metadata: { blocked_role: profile.role },
    })
    return xmlResponse(CARE_PARTNER_LIMIT_REPLY)
  }

  const deleteConfirmationReply = await handleDeleteConfirmation(supabase, profile, body)
  if (deleteConfirmationReply) {
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: deleteConfirmationReply,
      status: 'twiml_reply',
      metadata: { delete_confirmation_reply: body },
    })
    return xmlResponse(deleteConfirmationReply)
  }

  if (isDeleteRequest(body)) {
    const reply = await handleDeleteRequest(supabase, profile)
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: reply,
      status: 'twiml_reply',
      metadata: { delete: true, delete_prompt: true },
    })
    return xmlResponse(reply)
  }

  const deleteSelectionReply = await handleDeleteSelection(supabase, profile, body)
  if (deleteSelectionReply) {
    const deleteReplyBody = typeof deleteSelectionReply === 'string'
      ? deleteSelectionReply
      : deleteSelectionReply.reply
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: deleteReplyBody,
      status: 'twiml_reply',
      metadata: typeof deleteSelectionReply === 'string'
        ? { delete_selection: body }
        : {
            delete_selection: body,
            delete_confirm_prompt: true,
            delete_item_ids: deleteSelectionReply.selectedItems.map(item => item.id),
          },
    })
    return xmlResponse(deleteReplyBody)
  }

  if (isUndoRequest(body)) {
    const reply = await reopenMostRecentConfirmedItem(supabase, profile)
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: reply,
      status: 'twiml_reply',
      metadata: { undo: true, undo_prompt: true },
    })
    return xmlResponse(reply)
  }

  const undoSelectionReply = await handleUndoSelection(supabase, profile, body)
  if (undoSelectionReply) {
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: undoSelectionReply,
      status: 'twiml_reply',
      metadata: { undo_selection: body },
    })
    return xmlResponse(undoSelectionReply)
  }

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

  const naturalPendingReply = await handleNaturalPendingReply(supabase, profile, body)
  if (naturalPendingReply) {
    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: naturalPendingReply.reply,
      status: 'twiml_reply',
      metadata: { parsed: naturalPendingReply.parsed },
    })
    return xmlResponse(naturalPendingReply.reply)
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

  if (parsed.intent === 'completed' && parsed.items.length > 0) {
    const rows = parsed.items.map(item => ({
      household_id: profile.household_id,
      logged_by: profile.id,
      category: item.category as ActivityCategory,
      label: categoryLabel(item.category as ActivityCategory),
      note: item.note,
      occurred_at: new Date().toISOString(),
    }))

    const { data: activities, error } = await supabase
      .from('activity_logs')
      .insert(rows)
      .select()

    if (error) {
      console.error('[SMS] Completed activity insert failed:', error.message)
      return xmlResponse(`I had trouble saving that. Please open Context here: ${APP_URL}/mci-user`)
    }

    await trackEvent(supabase, {
      eventName: 'sms_completed_activity_parsed',
      profile,
      userId: profile.user_id,
      properties: {
        item_count: activities?.length ?? parsed.items.length,
        raw_length: body.length,
        parsed,
      },
    })

    const count = activities?.length ?? parsed.items.length
    const reply = count === 1
      ? 'I marked that as done in Context.'
      : `I marked ${count} activities as done in Context.`

    await logSmsMessage(supabase, {
      householdId: profile.household_id,
      profileId: profile.id,
      direction: 'outbound',
      purpose: 'inbound_confirmation',
      phoneE164: from,
      body: reply,
      status: 'twiml_reply',
      metadata: { parsed, activity_ids: activities?.map(item => item.id) ?? [] },
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
    label: categoryLabel(item.category as ActivityCategory),
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
