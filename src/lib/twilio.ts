import twilio from 'twilio'
import { getAppUrl } from '@/lib/sms'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken  = process.env.TWILIO_AUTH_TOKEN!
const fromNumber = process.env.TWILIO_PHONE_NUMBER!  // E.164, e.g. +18005550100

let _client: ReturnType<typeof twilio> | null = null

function getClient() {
  if (!_client) _client = twilio(accountSid, authToken)
  return _client
}

export async function sendSMS(to: string, body: string) {
  const client = getClient()
  try {
    const message = await client.messages.create({
      to,
      from: fromNumber,
      body,
      statusCallback: `${getAppUrl()}/api/twilio/status`,
    })
    return { sid: message.sid, status: message.status, error: null }
  } catch (err: any) {
    console.error('[Twilio] SMS failed:', err.message)
    return { sid: null, status: 'failed', error: err.message }
  }
}

export function buildReentryMessage(
  displayName: string,
  recentActivities: string[],
  cardTitle: string,
  cardBody: string,
  appUrl: string,
): string {
  const actList = recentActivities.slice(0, 3).join(', ')
  return [
    `Hi ${displayName} 👋 Context here.`,
    ``,
    `Before you stepped away you were: ${actList}.`,
    ``,
    `📌 ${cardTitle}`,
    cardBody.slice(0, 240),
    ``,
    `Open the app to see your full day: ${appUrl}`,
  ].join('\n')
}

export function buildPendingPlanReminderMessage(
  displayName: string,
  pendingItems: Array<{ icon: string; label: string; note: string | null; expected_period: string }>,
  appUrl: string,
): string {
  const lines = pendingItems.slice(0, 3).map(item => {
    const detail = item.note?.trim() || item.label
    return `  ${item.icon} ${detail}`
  })

  return [
    `Hi ${displayName}, a gentle Context reminder.`,
    ``,
    `Still waiting in today's plan:`,
    ...lines,
    ``,
    `Tap to confirm or mark later: ${appUrl}/mci-user`,
  ].join('\n')
}

export function buildDailySummaryMessage(
  carePartnerName: string,
  memberName: string,
  date: string,
  activities: Array<{ icon: string; label: string; occurred_at: string }>,
  appUrl: string,
  timeZone?: string | null,
): string {
  const lines = activities.slice(0, 8).map(a => {
    const t = new Date(a.occurred_at).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timeZone || undefined,
    })
    return `  ${a.icon} ${a.label} (${t})`
  })

  return [
    `Hi ${carePartnerName}, here's ${memberName}'s day for ${date}:`,
    ``,
    ...lines,
    ``,
    activities.length === 0
      ? 'No activities were logged today.'
      : `${activities.length} ${activities.length === 1 ? 'activity' : 'activities'} logged in total.`,
    ``,
    `Full view: ${appUrl}/care-partner`,
  ].join('\n')
}

export function buildPersonalDailySummaryMessage(
  displayName: string,
  date: string,
  activities: Array<{ icon: string; label: string; occurred_at: string }>,
  pendingCount: number,
  appUrl: string,
  timeZone?: string | null,
): string {
  const lines = activities.slice(0, 6).map(a => {
    const t = new Date(a.occurred_at).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timeZone || undefined,
    })
    return `  ${a.icon} ${a.label} (${t})`
  })

  return [
    `Hi ${displayName}, here is what Context saved today for ${date}:`,
    ``,
    ...lines,
    activities.length === 0 ? 'Nothing was confirmed today.' : '',
    pendingCount > 0 ? `${pendingCount} item${pendingCount !== 1 ? 's' : ''} still waiting in today's plan.` : `Everything in today's plan is settled.`,
    ``,
    `Open Context: ${appUrl}/mci-user`,
  ].filter(Boolean).join('\n')
}

export function buildPersonalWeeklySummaryMessage(
  dateLabel: string,
  completed: number,
  totalPlanned: number,
  appUrl: string,
) {
  return [
    `Your Context weekly summary for ${dateLabel} is ready.`,
    totalPlanned > 0
      ? `You completed ${completed} of ${totalPlanned} planned activities.`
      : 'No planned activities were recorded for the week.',
    `View your week: ${appUrl}/mci-user/weekly-summary`,
  ].join('\n\n')
}

export function buildCarePartnerWeeklySummaryMessage(
  dateLabel: string,
  completed: number,
  totalPlanned: number,
  appUrl: string,
) {
  return [
    `The Context weekly summary for ${dateLabel} is ready.`,
    totalPlanned > 0
      ? `${completed} of ${totalPlanned} planned activities were completed.`
      : 'No planned activities were recorded for the week.',
    `View the summary: ${appUrl}/care-partner/weekly-summary`,
  ].join('\n\n')
}
