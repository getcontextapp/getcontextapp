export const DUE_REMINDER_WINDOW_MINUTES = 9

export function parseExpectedTime(value: string | null | undefined) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '')
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

export function localDateAndMinute(now: Date, timeZone: string | null | undefined) {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
  }
  const parts = formatter.formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    minuteOfDay: Number(value('hour')) * 60 + Number(value('minute')),
  }
}

export function isDueReminderWindow(
  expectedTime: string | null | undefined,
  minuteOfDay: number,
  windowMinutes = DUE_REMINDER_WINDOW_MINUTES,
) {
  const expectedMinute = parseExpectedTime(expectedTime)
  if (expectedMinute === null) return false
  const elapsed = minuteOfDay - expectedMinute
  return elapsed >= 0 && elapsed <= windowMinutes
}

export function dueReminderCopy(detail: string, detailedContent: boolean) {
  return {
    title: 'A gentle reminder',
    pushBody: detailedContent
      ? `${detail} is due now.`
      : 'Something in your Context plan is due now.',
  }
}

export function dueReminderDetail(task: { category: string; label: string; note?: string | null }) {
  const label = task.label.trim()
  const note = task.note?.trim()
  const genericCustomLabel = ['custom', 'other'].includes(label.toLowerCase())

  if (task.category === 'custom' && !genericCustomLabel) return label
  return note || label
}
