import { formatTaskTiming, periodForTime } from '@/lib/task-scheduling'
import type { ExpectedPeriod, PlannedActivity, RepeatRule } from '@/types'

const UPDATE_WORDS = /\b(?:update|change|set|edit|adjust)\b/i
const TIME_WORDS = /\b(?:time|at|to)\b/i

export interface PlanUpdateIntent {
  activity: PlannedActivity
  note: string
  expected_period: ExpectedPeriod
  expected_time: string
  repeat_rule: RepeatRule
}

export function parsePlanUpdateTime(message: string) {
  const match = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || minute < 0 || minute > 59) return null

  const isPm = match[3].toLowerCase().startsWith('p')
  if (isPm && hour < 12) hour += 12
  if (!isPm && hour === 12) hour = 0

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function extractPlanUpdateTarget(message: string) {
  const withoutTimeZone = message
    .replace(/\b(?:est|edt|cst|cdt|mst|mdt|pst|pdt|pt|et|ct|mt)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const patterns = [
    /\btime\s+(?:for|of)\s+(.+?)\s+(?:to|at)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i,
    /\b(?:update|change|set|edit|adjust)\s+(?:the\s+)?(?:time\s+)?(?:for|of)\s+(.+?)\s+(?:to|at)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i,
    /\b(?:update|change|set|edit|adjust)\s+(.+?)\s+(?:to|at)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i,
  ]

  for (const pattern of patterns) {
    const match = withoutTimeZone.match(pattern)
    const target = match?.[1]?.trim()
    if (target) return cleanTarget(target)
  }

  return null
}

export function isPlanTimeUpdateMessage(message: string) {
  return UPDATE_WORDS.test(message) && TIME_WORDS.test(message) && Boolean(parsePlanUpdateTime(message))
}

export function normalizePlanText(text: string) {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => ![
      'please',
      'remind',
      'me',
      'i',
      'need',
      'want',
      'plan',
      'will',
      'to',
      'the',
      'a',
      'an',
      'my',
      'today',
      'tomorrow',
      'go',
      'yo',
      'do',
      'finish',
      'complete',
      'work',
      'on',
      'start',
      'continue',
      'respond',
      'task',
      'plan',
      'time',
    ].includes(word))
    .join(' ')
}

export function findPlanUpdateIntent(
  message: string,
  activities: PlannedActivity[],
): PlanUpdateIntent | null {
  if (!isPlanTimeUpdateMessage(message)) return null

  const expectedTime = parsePlanUpdateTime(message)
  const target = extractPlanUpdateTarget(message)
  if (!expectedTime || !target) return null

  const targetTokens = normalizePlanText(target).split(/\s+/).filter(Boolean)
  if (targetTokens.length === 0) return null

  const matches = activities
    .map(activity => ({ activity, score: matchScore(targetTokens, activity.note || activity.label || '') }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || b.activity.updated_at.localeCompare(a.activity.updated_at))

  if (matches.length === 0) return null
  if (targetTokens.length === 1) {
    const exactTokenMatches = matches.filter(match => {
      const candidateTokens = normalizePlanText(match.activity.note || match.activity.label || '').split(/\s+/).filter(Boolean)
      return candidateTokens.includes(targetTokens[0])
    })
    if (exactTokenMatches.length > 1) return null
  }
  if (matches.length > 1 && matches[0].score === matches[1].score) return null

  const activity = matches[0].activity
  return {
    activity,
    note: activity.note || activity.label || 'Plan item',
    expected_period: periodForTime(expectedTime),
    expected_time: expectedTime,
    repeat_rule: activity.repeat_rule ?? 'none',
  }
}

export function formatPlanUpdateReply(intent: PlanUpdateIntent) {
  return `Okay. I updated ${intent.note} to ${formatTaskTiming(intent.expected_time, intent.expected_period)} in today's Context plan.`
}

function cleanTarget(target: string) {
  return target
    .replace(/\b(?:task|plan|appointment|activity)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchScore(targetTokens: string[], candidate: string) {
  const candidateTokens = normalizePlanText(candidate).split(/\s+/).filter(Boolean)
  if (candidateTokens.length === 0) return 0

  let score = 0
  for (const target of targetTokens) {
    const tokenScore = Math.max(...candidateTokens.map(candidateToken => tokenSimilarity(target, candidateToken)))
    if (tokenScore < 0.6) return 0
    score += tokenScore
  }

  return score / Math.max(candidateTokens.length, targetTokens.length)
}

function tokenSimilarity(a: string, b: string) {
  if (a === b) return 1
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return 0.9
  if (a.length >= 4 && b.length >= 4 && editDistance(a, b) <= 1) return 0.8
  return 0
}

function editDistance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}
