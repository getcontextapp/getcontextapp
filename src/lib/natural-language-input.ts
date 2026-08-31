import { addDaysToKey } from '@/lib/task-scheduling'

export const PLAN_PROCESSING_WORD_LIMIT = 1_000
export const PLAN_PRESERVATION_LIMIT = 20_000
export const TIMELINE_CAPTURE_LIMIT = 500

export function countPlanWords(message: string) {
  return message.trim() ? message.trim().split(/\s+/).length : 0
}

export type SafeTimelineCapture = { type: 'doing_now' | 'did'; text: string }

function cleanCaptureText(text: string) {
  return text
    .trim()
    .replace(/^i\s+(?:am|was|did)\s+/i, '')
    .replace(/[.]+$/, '')
    .trim()
}

export function hasFutureOrMultiPlanCues(message: string) {
  const text = message.trim()
  return /\b(tomorrow|later|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|then|after that|going to|plan to|need to|want to|will|at\s+\d{1,2}(?::?\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i.test(text)
}

export function detectSafeTimelineCapture(message: string): SafeTimelineCapture | null {
  const text = message.trim().replace(/[—–]/g, ',').replace(/\s+/g, ' ')
  if (!text || text.length > TIMELINE_CAPTURE_LIMIT || hasFutureOrMultiPlanCues(text)) return null

  const nowMatch = text.match(/^(?:i am|i'm|im|i’m|we are|we're|currently|right now i am|right now i'm|right now im)\s+(.+)$/i)
  if (nowMatch && !/^going\b/i.test(nowMatch[1])) {
    return { type: 'doing_now', text: cleanCaptureText(nowMatch[1]) }
  }
  if (/\b(right now|currently|at the moment)\b/i.test(text) && !/\b(at|around)\s+\d{1,2}/i.test(text)) {
    return { type: 'doing_now', text: cleanCaptureText(text.replace(/\b(right now|currently|at the moment)\b/gi, '')) }
  }
  if (/^(?:i just|just|i already|already|i did|i finished|i completed|i had|i took|i went|i called|i made|i ate|i walked|i visited)\b/i.test(text)) {
    return { type: 'did', text: cleanCaptureText(text.replace(/^(?:i just|just|i already|already)\s+/i, '')) }
  }
  if (/\b(just did|just finished|just completed|just had|just took|just went|just called|just made|just ate|just walked|just visited)\b/i.test(text)) {
    return { type: 'did', text: cleanCaptureText(text) }
  }
  return null
}

function spokenClock(value: string) {
  if (/^\d{3,4}$/.test(value)) {
    const padded = value.padStart(4, '0')
    return `${Number(padded.slice(0, -2))}:${padded.slice(-2)}`
  }
  if (/^\d{1,2}:\d{2}$/.test(value)) return value
  return `${Number(value)}:00`
}

export function ambiguousTimeRangeClarification(message: string) {
  if (/\b(?:a\.?m\.?|p\.?m\.?)\b/i.test(message)) return null
  const match = message.match(/\b(\d{1,2})\s*(?:to|until|-)\s*(\d{3,4}|\d{1,2}:\d{2}|\d{1,2})\b/i)
  if (!match) return null
  const start = spokenClock(match[1])
  const end = spokenClock(match[2])
  const suggestedRange = `${start} AM to ${end} PM`
  return {
    question: `Did you mean ${suggestedRange}?`,
    suggestedMessage: message.replace(match[0], suggestedRange),
  }
}

export function splitPlanClauses(message: string) {
  return message
    .replace(/\b(?:and\s+then|then|after\s+that)\b/gi, '\n')
    .split(/[;\n]+|(?<=[.!?])\s+/)
    .map(part => part.trim().replace(/^[,\s]+|[,\s]+$/g, ''))
    .filter(Boolean)
}

export function plannedDateForText(text: string, todayKey: string) {
  if (/\btomorrow\b/i.test(text)) return addDaysToKey(todayKey, 1)
  return todayKey
}
